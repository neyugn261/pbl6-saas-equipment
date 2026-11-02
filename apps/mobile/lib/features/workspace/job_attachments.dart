import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
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
  });
  final WorkspaceRepository repo;
  final String orderId;
  final bool canUploadWorkOrder;
  final bool reportCompleted;
  final int revision;

  @override
  State<JobAttachments> createState() => _JobAttachmentsState();
}

class _JobAttachmentsState extends State<JobAttachments> {
  AttachmentAttempt? _pending;
  bool _busy = false;
  bool _cancelRequested = false;
  double? _progress;
  int _revision = 0;
  String? _notice;

  @override
  void initState() {
    super.initState();
    _pending = widget.repo.pendingUploads[widget.orderId];
  }

  String get _base => '${WorkspaceRepository.wo}/work-orders/${widget.orderId}';

  Future<List<Json>> _load(bool report) async {
    final result = await widget.repo.get(
      '$_base${report ? '/service-report' : ''}/attachments?page=1&pageSize=100',
    );
    return rows(result['items']);
  }

  String? _mime(String name) {
    final lower = name.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    return null;
  }

  Future<void> _pick(bool report, {ImageSource? source}) async {
    if (_busy || _pending != null || widget.repo.attachments == null) return;
    try {
      String name;
      Uint8List bytes;
      if (source != null) {
        final file = await ImagePicker().pickImage(
          source: source,
          imageQuality: 90,
        );
        if (file == null) return;
        name = file.name;
        bytes = await file.readAsBytes();
      } else {
        final file = await FilePicker.pickFile(
          type: FileType.custom,
          allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
        );
        if (file == null) return;
        final length = file.lengthSync() ?? await file.length();
        if (length == null || length > 10 * 1024 * 1024) {
          throw const ApiException('ATTACHMENT_TOO_LARGE', status: 413);
        }
        name = file.name;
        bytes = await file.readAsBytes();
      }
      final mime = _mime(name);
      if (mime == null) {
        throw const ApiException('ATTACHMENT_TYPE_UNSUPPORTED', status: 415);
      }
      setState(() {
        _pending = widget.repo.attachments!.create(
          workOrderId: widget.orderId,
          report: report,
          fileName: name,
          mimeType: mime,
          bytes: bytes,
        );
        widget.repo.pendingUploads[widget.orderId] = _pending!;
        _notice = null;
      });
      await _upload();
    } on ApiException catch (error) {
      if (mounted) setState(() => _notice = error.userMessage);
    } catch (_) {
      if (mounted) {
        setState(() => _notice = 'Không đọc được tệp. Vui lòng chọn lại.');
      }
    }
  }

  Future<void> _upload() async {
    final attempt = _pending;
    if (attempt == null || _busy) return;
    setState(() {
      _busy = true;
      _cancelRequested = false;
      _progress = attempt.putSucceeded ? 1 : null;
    });
    try {
      await widget.repo.attachments!.upload(
        attempt,
        onProgress: (sent, total) {
          if (mounted && _pending == attempt) {
            setState(() => _progress = sent / total);
          }
        },
      );
      widget.repo.pendingUploads.remove(widget.orderId);
      if (mounted) {
        setState(() {
          _pending = null;
          _progress = null;
          _notice = 'Đã đính kèm ${attempt.fileName}.';
          _revision++;
        });
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(
          () => _notice = error.code == 'UPLOAD_CANCELLED'
              ? 'Đang hủy lần tải này…'
              : error.userMessage,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      if (_cancelRequested) await _abort();
    }
  }

  Future<void> _cancel() async {
    final attempt = _pending;
    if (attempt == null || _cancelRequested) return;
    if (!_busy) return _abort();
    if (widget.repo.attachments!.cancelActivePut(attempt)) {
      setState(() => _cancelRequested = true);
    }
  }

  Future<void> _abort() async {
    final attempt = _pending;
    if (attempt == null || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.repo.attachments!.abort(attempt);
      widget.repo.pendingUploads.remove(widget.orderId);
      if (mounted) {
        setState(() {
          _pending = null;
          _progress = null;
          _cancelRequested = false;
          _notice = null;
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _notice = error.userMessage);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(String id) async {
    try {
      final value = await widget.repo.get(
        '${WorkspaceRepository.wo}/attachments/$id/download',
      );
      final raw = value['downloadUrl'];
      final uri = raw is String ? Uri.tryParse(raw) : null;
      if (uri == null ||
          !['https', 'http'].contains(uri.scheme) ||
          uri.host.isEmpty) {
        throw const ApiException('INVALID_RESPONSE');
      }
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        throw const ApiException('NETWORK_ERROR');
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _notice = error.userMessage);
    } catch (_) {
      if (mounted) {
        setState(() => _notice = 'Không mở được tệp. Vui lòng thử lại.');
      }
    }
  }

  Widget _section(bool report, {required bool canUpload}) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionTitle(report ? 'Tệp báo cáo' : 'Tệp công việc'),
      ReadView<List<Json>>(
        requestKey: '${widget.revision}/$_revision/$report',
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
      if (canUpload && _pending == null)
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () => _pick(report, source: ImageSource.camera),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Chụp ảnh'),
            ),
            OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () => _pick(report, source: ImageSource.gallery),
              icon: const Icon(Icons.photo_outlined),
              label: const Text('Chọn ảnh'),
            ),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _pick(report),
              icon: const Icon(Icons.attach_file),
              label: const Text('Chọn tệp'),
            ),
          ],
        ),
    ],
  );

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      if (_notice != null) Notice(_notice!),
      if (_pending != null)
        Notice(
          _busy
              ? 'Đang tải ${_pending!.fileName}…'
              : 'Tệp ${_pending!.fileName} chưa được xác nhận. Thử lại cùng lần tải hoặc hủy.',
          action: _busy
              ? Column(
                  children: [
                    const SizedBox(height: 8),
                    if (_progress == null)
                      const CircularProgressIndicator()
                    else ...[
                      LinearProgressIndicator(value: _progress),
                      Text('${(_progress! * 100).round()}%'),
                    ],
                    if (_pending!.isPutActive)
                      TextButton(
                        onPressed: _cancelRequested ? null : _cancel,
                        child: const Text('Hủy tải'),
                      ),
                  ],
                )
              : Wrap(
                  children: [
                    TextButton(
                      onPressed: _upload,
                      child: const Text('Thử lại'),
                    ),
                    TextButton(onPressed: _cancel, child: const Text('Hủy')),
                  ],
                ),
        ),
      _section(false, canUpload: widget.canUploadWorkOrder),
      ReadView<Json?>(
        requestKey: widget.revision,
        load: () async {
          try {
            return await widget.repo.get('$_base/service-report');
          } on ApiException catch (error) {
            if (error.status == 404 &&
                error.code == 'SERVICE_REPORT_NOT_FOUND') {
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
                builder: (technician) => _section(
                  true,
                  canUpload:
                      widget.reportCompleted &&
                      report['technicianId'] == technician['id'],
                ),
              ),
      ),
    ],
  );
}
