import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_exception.dart';
import '../../ui/components.dart';
import 'attachment_client.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class JobAttachments extends StatefulWidget {
  const JobAttachments({
    super.key,
    required this.repo,
    required this.orderId,
    required this.canUploadWorkOrder,
    required this.reportCompleted,
    required this.revision,
    this.onChanged,
  });
  final WorkspaceRepository repo;
  final String orderId;
  final bool canUploadWorkOrder, reportCompleted;
  final int revision;
  final VoidCallback? onChanged;
  @override
  State<JobAttachments> createState() => JobAttachmentsState();
}

class JobAttachmentsState extends State<JobAttachments> {
  AttachmentAttempt? _pending;
  bool _busy = false, _picking = false, _restoring = true;
  bool _pickingReport = false;
  bool _selectionFailed = false;
  double? _progress;
  int _revision = 0;
  String? _notice;
  bool get busy =>
      _busy || _picking || _restoring || (_pending?.inFlight ?? false);
  bool get blocksCompletion =>
      (_picking && !_pickingReport) || (_pending != null && !_pending!.report);
  String get _base => '${WorkspaceRepository.wo}/work-orders/${widget.orderId}';
  AttachmentClient? get client => widget.repo.attachments;
  void _changed() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted) widget.onChanged?.call();
  });
  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    try {
      final attempt =
          widget.repo.pendingUploads[widget.orderId] ??
          await client?.restore(widget.orderId);
      if (!mounted) return;
      setState(() {
        _pending = attempt;
        if (attempt != null) {
          _selectionFailed = false;
          widget.repo.pendingUploads[widget.orderId] = attempt;
        }
      });
    } catch (e) {
      if (mounted) setState(() => _notice = _message(e));
    } finally {
      if (mounted) {
        setState(() => _restoring = false);
        _changed();
      }
    }
  }

  @override
  void dispose() {
    // The durable receipt already precedes all network operations. Pause the
    // storage stream; keep original keys and never auto-replay from dispose.
    final attempt = _pending;
    if (attempt != null && client != null) unawaited(client!.pause(attempt));
    super.dispose();
  }

  String _message(Object e) => e is ApiException
      ? e.userMessage
      : 'Không xử lý được tệp. Vui lòng thử lại.';
  Future<List<Json>> _load(bool report) async {
    final page = PageData.parse(
      await widget.repo.read(
        '$_base${report ? '/service-report' : ''}/attachments?page=1&pageSize=100',
      ),
      object,
    );
    // K8 allows ten files per parent; do not silently truncate a changed contract.
    if (page.items.length != page.total) {
      throw const ApiException('READ_CHANGED');
    }
    return page.items;
  }

  Future<void> _pick(bool report, String source) async {
    if (busy ||
        _pending != null ||
        client == null ||
        widget.repo.selection == null) {
      return;
    }
    setState(() {
      _picking = true;
      _pickingReport = report;
      _selectionFailed = false;
      _notice = null;
    });
    _changed();
    try {
      final order = await widget.repo.order(widget.orderId);
      String authorityId;
      if (report) {
        final value = await widget.repo.get('$_base/service-report');
        final technician = await widget.repo.technician();
        if (order.status != 'COMPLETED' ||
            value['technicianId'] != technician['id']) {
          throw const ApiException('ATTACHMENT_PARENT_CHANGED');
        }
        authorityId = value['id'] as String;
      } else {
        if (!order.currentFor(widget.repo.user.id) ||
            ![
              'ACCEPTED',
              'TRAVELLING',
              'IN_PROGRESS',
              'ON_HOLD',
            ].contains(order.status)) {
          throw const ApiException('ATTACHMENT_PARENT_CHANGED');
        }
        authorityId = nested(order.data, 'currentAssignment')['id'] as String;
      }
      if (!mounted) return;
      final attempt = await widget.repo.selection!.pick(
        widget.orderId,
        report,
        authorityId,
        source,
      );
      if (attempt == null) return;
      if (!mounted) {
        return; // Capture persisted ownership before returning here.
      }
      await client!.stage(attempt);
      widget.repo.pendingUploads[widget.orderId] = attempt;
      if (mounted) {
        setState(() {
          _pending = attempt;
          _notice = 'Tệp đã được giữ trên máy. Xem lại rồi chủ động tải lên.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _notice = _message(e);
          _selectionFailed = true;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _picking = false);
        _changed();
      }
    }
  }

  Future<void> _upload() async {
    final attempt = _pending;
    if (attempt == null || busy || client == null) return;
    setState(() {
      _busy = true;
      _notice = null;
      _progress = attempt.putSucceeded ? 1 : null;
    });
    _changed();
    try {
      await client!.upload(
        attempt,
        onProgress: (sent, total) {
          if (mounted && identical(_pending, attempt)) {
            setState(() => _progress = sent / total);
          }
        },
      );
      if (identical(widget.repo.pendingUploads[widget.orderId], attempt)) {
        widget.repo.pendingUploads.remove(widget.orderId);
      }
      if (mounted) {
        setState(() {
          _pending = null;
          _notice = 'Đã đính kèm ${attempt.fileName}.';
          _revision++;
        });
      }
      widget.repo.changed();
    } catch (e) {
      if (mounted) {
        setState(
          () =>
              _notice = attempt.finalizeStarted && attempt.attachmentId == null
              ? 'Chưa xác nhận được kết quả đính kèm. Kiểm tra và tiếp tục cùng lần tải.'
              : _message(e),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _changed();
      }
    }
  }

  Future<void> _pause() async {
    if (_pending == null || client == null) return;
    final attempt = _pending!;
    await client!.pause(attempt);
    if (mounted && attempt.attachmentId == null) {
      setState(() => _notice = const ApiException('UPLOAD_PAUSED').userMessage);
    }
  }

  Future<bool> prepareLeave() async {
    if (_picking || _restoring) return false;
    if (!busy) return true;
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Dừng tải và rời công việc?'),
        content: const Text(
          'Tệp và thông tin lần tải được giữ trên máy. Khi quay lại, kiểm tra rồi chủ động tiếp tục.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Tiếp tục tải'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Dừng và giữ tệp'),
          ),
        ],
      ),
    );
    if (leave != true) return false;
    await _pause();
    return mounted;
  }

  Future<void> _abort({bool localOnly = false}) async {
    final attempt = _pending;
    if (attempt == null || busy || client == null) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(localOnly ? 'Xóa bản nháp trên máy?' : 'Hủy lần tải này?'),
        content: Text(
          localOnly
              ? 'Xóa tệp tạm và thông tin lần tải trên máy. Việc này không xóa tệp đã đính kèm trên máy chủ; kết quả lần gửi trước có thể chưa xác định.'
              : 'Tệp tạm chỉ được dọn sau khi máy chủ xác nhận hủy. Tệp đã đính kèm không bị xóa.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Giữ lại'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xác nhận'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _busy = true);
    _changed();
    try {
      if (localOnly) {
        await client!.forget(attempt);
      } else {
        await client!.abort(attempt);
      }
      if (identical(widget.repo.pendingUploads[widget.orderId], attempt)) {
        widget.repo.pendingUploads.remove(widget.orderId);
      }
      if (mounted) {
        setState(() {
          _pending = null;
          _notice = localOnly
              ? 'Đã xóa bản nháp trên máy.'
              : attempt.attachmentId != null
              ? 'Tệp đã được máy chủ ghi nhận; không xóa tệp đã đính kèm.'
              : 'Đã xử lý hủy lần tải.';
          _revision++;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _notice = _message(e));
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        _changed();
      }
    }
  }

  Future<void> _open(String id) async {
    try {
      final value = await widget.repo.get(
        '${WorkspaceRepository.wo}/attachments/$id/download',
      );
      final raw = value['downloadUrl'];
      final uri = raw is String ? Uri.tryParse(raw) : null;
      final expires = apiDate(value['expiresAt']);
      if (uri == null ||
          !['https', 'http'].contains(uri.scheme) ||
          uri.host.isEmpty ||
          uri.userInfo.isNotEmpty ||
          expires == null ||
          !expires.isAfter(DateTime.now())) {
        throw const ApiException('INVALID_RESPONSE');
      }
      if (!mounted) return;
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const ApiException('NETWORK_ERROR');
      }
    } catch (e) {
      if (mounted) setState(() => _notice = _message(e));
    }
  }

  Widget _section(bool report, {required bool canUpload}) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionTitle(report ? 'Tệp báo cáo' : 'Tệp công việc'),
      ReadView<List<Json>>(
        requestKey: '${widget.orderId}/${widget.revision}/$_revision/$report',
        load: () => _load(report),
        builder: (files) => files.isEmpty
            ? const Notice('Chưa có tệp đã hoàn tất.')
            : Column(
                children: [
                  for (final file in files)
                    ListTile(
                      title: Text(text(file, 'fileName')),
                      subtitle: Text(text(file, 'visibility')),
                      trailing: const Icon(Icons.open_in_new),
                      onTap: () => _open(text(file, 'id')),
                    ),
                ],
              ),
      ),
      if (canUpload &&
          _pending == null &&
          client != null &&
          widget.repo.selection != null)
        Wrap(
          spacing: 8,
          children: [
            for (final source in ['camera', 'gallery', 'document'])
              OutlinedButton.icon(
                key: Key('attachment-pick-${report ? 'report' : 'wo'}-$source'),
                onPressed: busy ? null : () => _pick(report, source),
                icon: Icon(
                  source == 'camera'
                      ? Icons.camera_alt_outlined
                      : source == 'gallery'
                      ? Icons.photo_outlined
                      : Icons.attach_file,
                ),
                label: Text(
                  source == 'camera'
                      ? 'Chụp ảnh'
                      : source == 'gallery'
                      ? 'Chọn ảnh'
                      : 'Chọn tệp',
                ),
              ),
          ],
        ),
    ],
  );
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (_restoring || _picking) const LinearProgressIndicator(),
      if (_notice != null) Notice(_notice!),
      if (_selectionFailed && widget.repo.selection != null && _pending == null)
        TextButton(
          onPressed: busy
              ? null
              : () async {
                  await widget.repo.selection!.recover();
                  await _restore();
                  widget.repo.changed();
                },
          child: const Text('Khôi phục lần chọn tệp'),
        ),
      if (_pending != null) ...[
        Text(
          _pending!.fileName,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Text(
          '${_pending!.sizeBytes} byte · ${_pending!.report ? 'Tệp báo cáo' : 'Tệp công việc'}',
        ),
        if (_pending!.bytes.isEmpty)
          const Notice(
            'Tệp trên máy không còn khả dụng. Có thể kiểm tra kết quả hoặc hủy lần tải; không gửi nội dung khác thay thế.',
          ),
        if (_pending!.mimeType.startsWith('image/') &&
            _pending!.bytes.isNotEmpty)
          Image.memory(
            _pending!.bytes,
            height: 140,
            cacheWidth: 320,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined),
          ),
        if (!_pending!.prepareStarted)
          const Text('Đang lưu trên máy · Chưa gửi lên máy chủ'),
        if (_busy) ...[
          LinearProgressIndicator(value: _progress),
          Text(
            _progress == 1
                ? 'Đã truyền nội dung; đang chờ máy chủ xác nhận.'
                : 'Đang truyền tệp…',
          ),
          TextButton(onPressed: _pause, child: const Text('Dừng và giữ tệp')),
        ] else
          Wrap(
            children: [
              FilledButton(
                key: const Key('attachment-resume'),
                onPressed: busy ? null : _upload,
                child: Text(
                  _pending!.prepareStarted
                      ? 'Kiểm tra và tiếp tục lần tải'
                      : 'Tải tệp lên',
                ),
              ),
              TextButton(
                onPressed: busy ? null : () => _abort(),
                child: const Text('Hủy lần tải'),
              ),
              TextButton(
                onPressed: busy ? null : () => _abort(localOnly: true),
                child: const Text('Xóa nháp trên máy'),
              ),
            ],
          ),
      ],
      _section(false, canUpload: widget.canUploadWorkOrder),
      ReadView<Json?>(
        requestKey: '${widget.orderId}/${widget.revision}',
        load: () async {
          try {
            return await widget.repo.get('$_base/service-report');
          } on ApiException catch (e) {
            if (e.status == 404 && e.code == 'SERVICE_REPORT_NOT_FOUND') {
              return null;
            }
            rethrow;
          }
        },
        builder: (report) => report == null
            ? const Notice(
                'Gửi báo cáo dịch vụ trước khi đính kèm tệp báo cáo.',
              )
            : ReadView<Json>(
                requestKey: widget.revision,
                load: widget.repo.technician,
                builder: (tech) => _section(
                  true,
                  canUpload:
                      widget.reportCompleted &&
                      report['technicianId'] == tech['id'],
                ),
              ),
      ),
    ],
  );
}
