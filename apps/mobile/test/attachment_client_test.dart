import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:pbl6_technician/core/api/api_exception.dart';
import 'package:pbl6_technician/features/workspace/attachment_client.dart';

void main() {
  test(
    'finalize retry preserves keys and never forwards bearer token to storage',
    () async {
      var scope = 'tenant/user';
      var prepareCalls = 0, putCalls = 0, finalizeCalls = 0;
      String? prepareKey, finalizeKey;
      final client = AttachmentClient(
        sessionScope: () => scope,
        storage: MockClient((request) async {
          putCalls++;
          expect(request.method, 'PUT');
          expect(request.headers['authorization'], isNull);
          expect(request.headers['content-type'], 'image/png');
          expect(request.bodyBytes, [1, 2, 3]);
          return http.Response('', 200);
        }),
        api: (method, path, {body, idempotencyKey}) async {
          if (path.endsWith('/attachment-uploads')) {
            prepareCalls++;
            prepareKey ??= idempotencyKey;
            expect(idempotencyKey, prepareKey);
            return {
              'uploadId': 'upload-id',
              'method': 'PUT',
              'uploadUrl': 'https://storage.invalid/staging',
              'headers': {'Content-Type': 'image/png'},
              'expiresAt': DateTime.now()
                  .add(const Duration(minutes: 1))
                  .toUtc()
                  .toIso8601String(),
            };
          }
          finalizeCalls++;
          finalizeKey ??= idempotencyKey;
          expect(idempotencyKey, finalizeKey);
          if (finalizeCalls == 1) throw const ApiException('TIMEOUT');
          return {'id': 'attachment-id'};
        },
      );
      final attempt = client.create(
        workOrderId: 'order-id',
        report: false,
        fileName: 'photo.png',
        mimeType: 'image/png',
        bytes: Uint8List.fromList([1, 2, 3]),
      );
      await expectLater(client.upload(attempt), throwsA(isA<ApiException>()));
      expect(attempt.attachmentId, isNull);
      expect((await client.upload(attempt))['id'], 'attachment-id');
      expect([prepareCalls, putCalls, finalizeCalls], [1, 1, 2]);
      expect(prepareKey, isNot(finalizeKey));
      scope = 'tenant/other-user';
      await expectLater(client.upload(attempt), throwsA(isA<ApiException>()));
      client.close();
    },
  );

  test('rejects unsafe input before any API or storage request', () {
    final client = AttachmentClient(
      sessionScope: () => 'tenant/user',
      api: (method, path, {body, idempotencyKey}) async =>
          throw StateError('called'),
    );
    expect(
      () => client.create(
        workOrderId: 'order-id',
        report: false,
        fileName: '../secret.png',
        mimeType: 'image/png',
        bytes: Uint8List(1),
      ),
      throwsA(isA<ApiException>()),
    );
    expect(
      () => client.create(
        workOrderId: 'order-id',
        report: false,
        fileName: 'huge.pdf',
        mimeType: 'application/pdf',
        bytes: Uint8List(10 * 1024 * 1024 + 1),
      ),
      throwsA(isA<ApiException>()),
    );
    client.close();
  });

  test(
    'reports PUT bytes and cancels before finalize using the same upload ID',
    () async {
      var finalized = false, aborted = false;
      final progress = <int>[];
      late AttachmentClient client;
      client = AttachmentClient(
        sessionScope: () => 'tenant/user',
        storage: MockClient((request) async => http.Response('', 200)),
        api: (method, path, {body, idempotencyKey}) async {
          if (path.endsWith('/attachment-uploads')) {
            return {
              'uploadId': 'upload-id',
              'method': 'PUT',
              'uploadUrl': 'https://storage.invalid/staging',
              'headers': {'Content-Type': 'image/png'},
              'expiresAt': DateTime.now()
                  .add(const Duration(minutes: 1))
                  .toUtc()
                  .toIso8601String(),
            };
          }
          if (method == 'DELETE') {
            aborted = true;
            expect(path, '/api/workorders/attachment-uploads/upload-id');
            return null;
          }
          finalized = true;
          return {'id': 'attachment-id'};
        },
      );
      final attempt = client.create(
        workOrderId: 'order-id',
        report: false,
        fileName: 'photo.png',
        mimeType: 'image/png',
        bytes: Uint8List(128 * 1024),
      );
      await expectLater(
        client.upload(
          attempt,
          onProgress: (sent, total) {
            progress.add(sent);
            expect(total, 128 * 1024);
            if (sent == 64 * 1024) {
              expect(client.cancelActivePut(attempt), isTrue);
            }
          },
        ),
        throwsA(
          isA<ApiException>().having((e) => e.code, 'code', 'UPLOAD_CANCELLED'),
        ),
      );
      expect(progress, [0, 64 * 1024]);
      expect(finalized, isFalse);
      await client.abort(attempt);
      expect(aborted, isTrue);
      client.close();
    },
  );

  test('session switch during PUT prevents finalize', () async {
    var scope = 'tenant/first-user';
    var finalized = false;
    final client = AttachmentClient(
      sessionScope: () => scope,
      storage: MockClient((request) async => http.Response('', 200)),
      api: (method, path, {body, idempotencyKey}) async {
        if (path.endsWith('/attachment-uploads')) {
          return {
            'uploadId': 'upload-id',
            'method': 'PUT',
            'uploadUrl': 'https://storage.invalid/staging',
            'headers': {'Content-Type': 'image/png'},
            'expiresAt': DateTime.now()
                .add(const Duration(minutes: 1))
                .toUtc()
                .toIso8601String(),
          };
        }
        finalized = true;
        return {'id': 'attachment-id'};
      },
    );
    final attempt = client.create(
      workOrderId: 'order-id',
      report: false,
      fileName: 'photo.png',
      mimeType: 'image/png',
      bytes: Uint8List(128 * 1024),
    );
    await expectLater(
      client.upload(
        attempt,
        onProgress: (sent, _) {
          if (sent == 64 * 1024) scope = 'tenant/other-user';
        },
      ),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'SESSION_CHANGED'),
      ),
    );
    expect(finalized, isFalse);
    expect(attempt.putSucceeded, isFalse);
    client.close();
  });
}
