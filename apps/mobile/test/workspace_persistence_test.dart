import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/workspace_store.dart';
import 'package:pbl6_technician/features/workspace/workspace_repository.dart';
import 'package:pbl6_technician/features/workspace/work_order_workflow.dart';

import 'support/workflow_server.dart';
import 'support/workspace_fixture.dart' show orderId;

class FaultStore implements WorkspaceStore {
  final inner = MemoryWorkspaceStore();
  bool failRead = false, failWrite = false, failAfterWrite = false;
  Completer<void>? gate;
  @override
  Future<LocalRecord?> read(String id) async {
    if (failRead) throw Exception('Storage unavailable');
    return inner.read(id);
  }

  @override
  Future<void> write(String id, LocalRecord value) async {
    await gate?.future;
    if (failWrite) throw Exception('Disk full');
    await inner.write(id, value);
    if (failAfterWrite) throw Exception('Disk flush failed');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('pbl6/session_storage');
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (_) async => null);
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null),
  );
  test('encrypted drafts isolate environment, tenant, user, WO and independent sections', () async {
    WorkspaceRecords scoped(String origin, String tenant, String user) =>
        WorkspaceRecords(
          SecureWorkspaceStore(origin: origin, tenantId: tenant, userId: user),
        );
    final a = scoped('https://a.test', 'ta', 'ua');
    await Future.wait([
      a.put('wo', 'reportDraft', {'private': 'draft'}),
      a.put('wo', 'checklistDraft', {'results': []}),
      a.put('wo', 'pendingCommand', {'action': 'complete'}),
    ]);
    expect(
      await scoped('https://a.test', 'ta', 'ua').get('wo', 'reportDraft'),
      {'private': 'draft'},
    );
    for (final other in [
      scoped('https://b.test', 'ta', 'ua'),
      scoped('https://a.test', 'tb', 'ua'),
      scoped('https://a.test', 'ta', 'ub'),
    ]) {
      expect(await other.get('wo', 'reportDraft'), isNull);
    }
    expect(await a.get('other', 'reportDraft'), isNull);
    await a.put('wo', 'reportDraft', null);
    expect(await a.get('wo', 'pendingCommand'), {'action': 'complete'});
    expect(await a.get('wo', 'checklistDraft'), {'results': []});
  });
  test('failed storage operations never become empty records and later writes recover', () async {
    final store = FaultStore();
    final a = WorkspaceRecords(store);
    store.failWrite = true;
    await expectLater(
      a.put('wo', 'reportDraft', {'a': 1}),
      throwsA(isA<ApiException>()),
    );
    store.failWrite = false;
    await a.put('wo', 'reportDraft', {'a': 2});
    expect(await a.get('wo', 'reportDraft'), {'a': 2});
    store.failRead = true;
    await expectLater(
      a.get('wo', 'pendingCommand'),
      throwsA(isA<ApiException>()),
    );
  });
  test('corrupt encrypted intent is retained and fails closed', () async {
    final a = SecureWorkspaceStore(
      origin: 'https://corrupt.test',
      tenantId: 't',
      userId: 'u',
    );
    await a.write('wo', {
      'schemaVersion': 1,
      'pendingCommand': {'action': 'complete'},
    });
    const raw = FlutterSecureStorage(
      aOptions: AndroidOptions(
        resetOnError: false,
        storageNamespace: 'pbl6_session_v1',
      ),
    );
    final key = (await raw.readAll()).keys.single;
    await raw.write(key: key, value: '{corrupt');
    await expectLater(a.read('wo'), throwsA(isA<ApiException>()));
    expect(await raw.read(key: key), '{corrupt');
  });
  test('intent disk acknowledgement is required before POST', () async {
    final server = WorkflowServer();
    final store = FaultStore();
    final repo = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    final flow = WorkOrderWorkflow(repo, orderId);
    addTearDown(flow.dispose);
    addTearDown(repo.dispose);
    await flow.load();
    store.gate = Completer<void>();
    final sent = flow.execute('accept');
    await Future<void>.delayed(Duration.zero);
    expect(server.writes, 0);
    store.gate!.complete();
    expect(await sent, true);
    expect(server.writes, 1);
  });
  test('disk failure before dispatch prevents mutation', () async {
    final server = WorkflowServer();
    final store = FaultStore();
    final repo = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    final flow = WorkOrderWorkflow(repo, orderId);
    addTearDown(flow.dispose);
    addTearDown(repo.dispose);
    await flow.load();
    store.failWrite = true;
    expect(await flow.execute('accept'), false);
    expect(server.writes, 0);
  });
  test(
    'malformed checklist receipt blocks mutations without erasing evidence',
    () async {
      final server = WorkflowServer(), store = MemoryWorkspaceStore();
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final flow = WorkOrderWorkflow(repo, orderId);
      addTearDown(flow.dispose);
      addTearDown(repo.dispose);
      await repo.records.put(orderId, 'pendingChecklist', {
        'expectedVersion': 'invalid',
      });
      await flow.load();
      expect(flow.loadError?.code, 'WORKSPACE_STORAGE_FAILED');
      expect(flow.can('accept'), false);
      expect(await repo.records.get(orderId, 'pendingChecklist'), {
        'expectedVersion': 'invalid',
      });
      expect(server.writes, 0);
    },
  );
  test(
    'session loss after dispatch retains receipt for the next login',
    () async {
      final server = WorkflowServer('IN_PROGRESS'),
          store = MemoryWorkspaceStore();
      final old = WorkspaceRepository(
        server.read,
        workflowUser,
        store: store,
        write: (path, body) async {
          await server.write(path, body);
          throw const ApiException('SESSION_CHANGED');
        },
      );
      final flow = WorkOrderWorkflow(old, orderId);
      await flow.load();
      server.beforeRead = (_) async {
        if (server.writes > 0) throw const ApiException('SESSION_CHANGED');
      };
      expect(await flow.execute('complete', body: validReport), false);
      expect(flow.uncertain, true);
      expect(await old.records.get(orderId, 'pendingCommand'), isNotNull);
      flow.dispose();
      old.dispose();
      server.beforeRead = null;
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final restored = WorkOrderWorkflow(repo, orderId);
      addTearDown(restored.dispose);
      addTearDown(repo.dispose);
      await restored.load();
      expect(restored.uncertain, false);
      expect(restored.order!.status, 'COMPLETED');
      expect(server.writes, 1);
    },
  );
  test(
    'fresh repository proves a committed report after restart without replay',
    () async {
      final server = WorkflowServer('IN_PROGRESS');
      final store = MemoryWorkspaceStore();
      final old = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final flow = WorkOrderWorkflow(old, orderId);
      await flow.load();
      server.timeoutAfterApply = true;
      server.beforeRead = (_) async {
        if (server.writes > 0) throw const ApiException('NETWORK_ERROR');
      };
      expect(await flow.execute('complete', body: validReport), false);
      expect(flow.uncertain, true);
      flow.dispose();
      old.dispose();
      server.beforeRead = null;
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final restored = WorkOrderWorkflow(repo, orderId);
      addTearDown(restored.dispose);
      addTearDown(repo.dispose);
      await restored.load();
      expect(restored.order!.status, 'COMPLETED');
      expect(restored.uncertain, false);
      expect(
        restored.confirmedReport!['customerSummary'],
        validReport['customerSummary'],
      );
      expect(server.writes, 1);
    },
  );
  test('restart with uncertain note retains pre-existing log IDs and blocks duplicates', () async {
    final server = WorkflowServer('IN_PROGRESS');
    final store = MemoryWorkspaceStore();
    server.apply('logs', {'note': 'Same note'});
    final old = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    final flow = WorkOrderWorkflow(old, orderId);
    await flow.load();
    server.timeoutBeforeApply = true;
    expect(await flow.execute('logs', body: {'note': 'Same note'}), false);
    flow.dispose();
    old.dispose();
    final repo = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    final restored = WorkOrderWorkflow(repo, orderId);
    addTearDown(restored.dispose);
    addTearDown(repo.dispose);
    await restored.load();
    expect(restored.uncertain, true);
    expect(restored.canNote, false);
    expect(server.writes, 1);
    expect(server.logs.length, 1);
    server.apply('logs', {'note': 'Same note'});
    expect(await restored.checkOutcome(), true);
    expect(server.writes, 1);
  });
  test(
    'restored receipt observes reassignment without sending the old body',
    () async {
      final server = WorkflowServer('IN_PROGRESS');
      final store = MemoryWorkspaceStore();
      final old = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final flow = WorkOrderWorkflow(old, orderId);
      await flow.load();
      server.timeoutBeforeApply = true;
      await flow.execute('complete', body: validReport);
      flow.dispose();
      old.dispose();
      server.setStatus('ASSIGNED', owner: 'user-b', assignmentId: 'new');
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final restored = WorkOrderWorkflow(repo, orderId);
      addTearDown(restored.dispose);
      addTearDown(repo.dispose);
      await restored.load();
      expect(restored.can('complete'), false);
      expect(restored.uncertain, false);
      expect(server.writes, 1);
      expect(restored.notice, contains('phân công'));
    },
  );
  test('an old response cannot erase a newer receipt', () async {
    final store = MemoryWorkspaceStore();
    final server = WorkflowServer('IN_PROGRESS');
    final repo = WorkspaceRepository(
      server.read,
      workflowUser,
      write: server.write,
      store: store,
    );
    addTearDown(repo.dispose);
    final old = PendingWorkOrderCommand('logs', {
      'note': 'old',
    }, WorkOrder(server.current));
    repo.pendingCommands[orderId] = old;
    await repo.records.put(orderId, 'pendingCommand', {
      'operationId': 'newer',
      'action': 'complete',
    });
    await repo.clearPending(orderId, old);
    expect(
      (await repo.records.get(orderId, 'pendingCommand'))!['operationId'],
      'newer',
    );
  });
  test(
    'a local flush failure can recover without pretending a POST was sent',
    () async {
      final server = WorkflowServer();
      final store = FaultStore();
      final repo = WorkspaceRepository(
        server.read,
        workflowUser,
        write: server.write,
        store: store,
      );
      final flow = WorkOrderWorkflow(repo, orderId);
      addTearDown(flow.dispose);
      addTearDown(repo.dispose);
      await flow.load();
      store.failAfterWrite = true;
      await flow.execute('accept');
      expect(flow.uncertain, true);
      expect(server.writes, 0);
      store.failAfterWrite = false;
      await flow.checkOutcome();
      expect(flow.uncertain, false);
      expect(flow.can('accept'), true);
      expect(server.writes, 0);
    },
  );
}
