import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/api/api_exception.dart';
import '../../ui/theme.dart';
import 'part_request_models.dart';
import 'part_usage.dart';
import 'workspace_repository.dart';

/// Interactive modal bottom sheet for creating a Part Request.
class CreatePartRequestSheet extends StatefulWidget {
  const CreatePartRequestSheet({
    super.key,
    required this.repo,
    required this.workOrderId,
    required this.onCreated,
  });

  final WorkspaceRepository repo;
  final String workOrderId;
  final VoidCallback onCreated;

  static Future<void> show(
    BuildContext context, {
    required WorkspaceRepository repo,
    required String workOrderId,
    required VoidCallback onCreated,
  }) => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => CreatePartRequestSheet(
      repo: repo,
      workOrderId: workOrderId,
      onCreated: onCreated,
    ),
  );

  @override
  State<CreatePartRequestSheet> createState() => _CreatePartRequestSheetState();
}

class _SelectedLine {
  _SelectedLine({required this.part, this.quantity = 1});
  final CatalogPart part;
  double quantity;
}

class _CreatePartRequestSheetState extends State<CreatePartRequestSheet> {
  final _reasonController = TextEditingController();
  final _searchController = TextEditingController();
  final _selectedLines = <_SelectedLine>[];

  List<CatalogPart>? _searchResults;
  bool _searching = false;
  bool _submitting = false;
  String? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _doSearch('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _reasonController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _doSearch(query));
  }

  Future<void> _doSearch(String query) async {
    setState(() => _searching = true);
    try {
      final results = await widget.repo.searchPartsCatalog(query);
      if (mounted) {
        setState(() {
          _searchResults = results;
          _searching = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _addPart(CatalogPart part) {
    setState(() {
      final existing = _selectedLines.indexWhere((l) => l.part.id == part.id);
      if (existing >= 0) {
        _selectedLines[existing].quantity += 1;
      } else {
        _selectedLines.add(_SelectedLine(part: part, quantity: 1));
      }
    });
  }

  void _removeLine(int index) {
    setState(() => _selectedLines.removeAt(index));
  }

  void _updateQuantity(int index, double delta) {
    setState(() {
      final current = _selectedLines[index];
      final next = current.quantity + delta;
      if (next > 0) {
        current.quantity = next;
      }
    });
  }

  Future<void> _submit() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'Vui lòng nhập lý do xin cấp phụ tùng.');
      return;
    }
    if (_selectedLines.isEmpty) {
      setState(() => _error = 'Vui lòng chọn ít nhất 1 linh kiện.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final lines = _selectedLines.map((l) {
        final qtyStr = l.part.allowFractional
            ? l.quantity.toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '')
            : l.quantity.toInt().toString();
        return {'partId': l.part.id, 'quantity': qtyStr};
      }).toList();

      await widget.repo.createPartRequest(
        widget.workOrderId,
        reason: reason,
        lines: lines,
      );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã gửi phiếu xin cấp phụ tùng thành công.')),
        );
        widget.onCreated();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Không thể gửi yêu cầu (${e.code}). Vui lòng kiểm tra lại.';
        });
      }
    } catch (e, st) {
      debugPrint('CreateReturnRequest error: $e\n$st');
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.of(context).viewInsets;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Xin cấp phụ tùng',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Chọn phụ tùng từ danh mục và nhập số lượng cần cấp cho công việc.',
            style: TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.paleBerry,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _error!,
                style: const TextStyle(color: AppColors.berry, fontSize: 13),
              ),
            ),
            const SizedBox(height: 8),
          ],
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    key: const Key('part-catalog-search'),
                    controller: _searchController,
                    decoration: InputDecoration(
                      labelText: 'Tìm linh kiện theo tên hoặc SKU',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear),
                              onPressed: () {
                                _searchController.clear();
                                _doSearch('');
                              },
                            )
                          : null,
                    ),
                    onChanged: _onSearchChanged,
                  ),
                  const SizedBox(height: 8),
                  if (_searching)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (_searchResults != null && _searchResults!.isNotEmpty)
                    Container(
                      constraints: const BoxConstraints(maxHeight: 180),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: _searchResults!.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (ctx, i) {
                          final part = _searchResults![i];
                          return ListTile(
                            dense: true,
                            title: Text(part.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                            subtitle: Text('SKU: ${part.sku} · Đơn vị: ${part.unit}'),
                            trailing: IconButton(
                              key: Key('add-part-${part.id}'),
                              icon: const Icon(Icons.add_circle_outline, color: AppColors.teal),
                              onPressed: () => _addPart(part),
                            ),
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 16),
                  if (_selectedLines.isNotEmpty) ...[
                    Text(
                      'Linh kiện đã chọn (${_selectedLines.length})',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                    ),
                    const SizedBox(height: 8),
                    for (var i = 0; i < _selectedLines.length; i++)
                      Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _selectedLines[i].part.name,
                                      style: const TextStyle(fontWeight: FontWeight.w600),
                                    ),
                                    Text(
                                      '${_selectedLines[i].part.sku} · ${_selectedLines[i].part.unit}',
                                      style: const TextStyle(color: AppColors.muted, fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline, size: 20),
                                onPressed: _selectedLines[i].quantity > 1
                                    ? () => _updateQuantity(i, -1)
                                    : null,
                              ),
                              Text(
                                _selectedLines[i].part.allowFractional
                                    ? _selectedLines[i].quantity.toStringAsFixed(1)
                                    : _selectedLines[i].quantity.toInt().toString(),
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              IconButton(
                                icon: const Icon(Icons.add_circle_outline, size: 20),
                                onPressed: () => _updateQuantity(i, 1),
                              ),
                              IconButton(
                                icon: const Icon(Icons.delete_outline, color: AppColors.berry, size: 20),
                                onPressed: () => _removeLine(i),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    key: const Key('part-request-reason'),
                    controller: _reasonController,
                    maxLines: 3,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: 'Lý do xin cấp phụ tùng *',
                      hintText: 'Nhập chi tiết nhu cầu kỹ thuật (vd: thay bo nguồn bị chập điện)...',
                      alignLabelWithHint: true,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            key: const Key('submit-part-request'),
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.send_outlined),
            label: Text(_submitting ? 'Đang gửi yêu cầu...' : 'Gửi phiếu xin cấp'),
          ),
        ],
      ),
    );
  }
}

/// Dialog for creating a Return Request for an unreconciled issued part.
class CreateReturnRequestDialog extends StatefulWidget {
  const CreateReturnRequestDialog({
    super.key,
    required this.repo,
    required this.item,
    required this.onCreated,
  });

  final WorkspaceRepository repo;
  final PartUsage item;
  final VoidCallback onCreated;

  static Future<void> show(
    BuildContext context, {
    required WorkspaceRepository repo,
    required PartUsage item,
    required VoidCallback onCreated,
  }) => showDialog<void>(
    context: context,
    builder: (ctx) => CreateReturnRequestDialog(
      repo: repo,
      item: item,
      onCreated: onCreated,
    ),
  );

  @override
  State<CreateReturnRequestDialog> createState() => _CreateReturnRequestDialogState();
}

class _CreateReturnRequestDialogState extends State<CreateReturnRequestDialog> {
  late final TextEditingController _qtyController;
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _qtyController = TextEditingController(text: widget.item.unreconciled.value);
  }

  @override
  void dispose() {
    _qtyController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final qtyText = _qtyController.text.trim();
    final reason = _reasonController.text.trim();

    final parsedQty = double.tryParse(qtyText);
    final maxQty = double.tryParse(widget.item.unreconciled.value) ?? 0;

    if (parsedQty == null || parsedQty <= 0) {
      setState(() => _error = 'Số lượng trả kho phải lớn hơn 0.');
      return;
    }
    if (parsedQty > maxQty) {
      setState(() => _error = 'Số lượng không được vượt quá số chưa đối soát ($maxQty).');
      return;
    }
    if (reason.isEmpty) {
      setState(() => _error = 'Vui lòng nhập lý do đề nghị trả kho.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await widget.repo.createReturnRequest(
        widget.item.id,
        quantity: qtyText,
        reason: reason,
      );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã gửi đề nghị trả kho thành công.')),
        );
        widget.onCreated();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Không thể gửi đề nghị (${e.code}). Vui lòng kiểm tra lại.';
        });
      }
    } catch (e, st) {
      debugPrint('CreateReturnRequest error: $e\n$st');
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Đề nghị trả kho'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.item.name ?? 'Phụ tùng chưa có tên',
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          Text(
            'Mã: ${widget.item.sku ?? 'N/A'} · Kho: ${widget.item.warehouseName ?? 'N/A'}',
            style: const TextStyle(color: AppColors.muted, fontSize: 13),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.paleTeal,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              'Số lượng chưa đối soát có thể trả: ${widget.item.unreconciled.value} ${widget.item.unit ?? ''}',
              style: const TextStyle(color: AppColors.teal, fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(height: 12),
          if (_error != null) ...[
            Text(
              _error!,
              style: const TextStyle(color: AppColors.berry, fontSize: 13),
            ),
            const SizedBox(height: 8),
          ],
          TextField(
            key: const Key('return-quantity-input'),
            controller: _qtyController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: 'Số lượng trả kho *',
              suffixText: widget.item.unit ?? '',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('return-reason-input'),
            controller: _reasonController,
            maxLines: 2,
            maxLength: 2000,
            decoration: const InputDecoration(
              labelText: 'Lý do trả kho *',
              hintText: 'Ví dụ: Phụ tùng dư sau sửa chữa...',
            ),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: _submitting ? null : () => Navigator.of(context).pop(),
        child: const Text('Hủy'),
      ),
      FilledButton(
        key: const Key('submit-return-request'),
        onPressed: _submitting ? null : _submit,
        child: _submitting
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Gửi đề nghị'),
      ),
    ],
  );
}

/// Dialog to confirm cancellation of a Part Request.
class CancelPartRequestDialog extends StatefulWidget {
  const CancelPartRequestDialog({
    super.key,
    required this.repo,
    required this.request,
    required this.onCancelled,
  });

  final WorkspaceRepository repo;
  final PartRequest request;
  final VoidCallback onCancelled;

  static Future<void> show(
    BuildContext context, {
    required WorkspaceRepository repo,
    required PartRequest request,
    required VoidCallback onCancelled,
  }) => showDialog<void>(
    context: context,
    builder: (ctx) => CancelPartRequestDialog(
      repo: repo,
      request: request,
      onCancelled: onCancelled,
    ),
  );

  @override
  State<CancelPartRequestDialog> createState() => _CancelPartRequestDialogState();
}

class _CancelPartRequestDialogState extends State<CancelPartRequestDialog> {
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'Vui lòng nhập lý do hủy phiếu.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await widget.repo.cancelPartRequest(
        widget.request.id,
        expectedVersion: widget.request.version,
        reason: reason,
      );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã hủy phiếu xin cấp phụ tùng thành công.')),
        );
        widget.onCancelled();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Không thể hủy phiếu (${e.code}). Vui lòng kiểm tra lại.';
        });
      }
    } catch (e, st) {
      debugPrint('CreateReturnRequest error: $e\n$st');
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Hủy phiếu xin cấp'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Bạn có chắc muốn hủy phiếu ${widget.request.requestNo}?'),
        const SizedBox(height: 12),
        if (_error != null) ...[
          Text(
            _error!,
            style: const TextStyle(color: AppColors.berry, fontSize: 13),
          ),
          const SizedBox(height: 8),
        ],
        TextField(
          key: const Key('cancel-reason-input'),
          controller: _reasonController,
          maxLines: 2,
          maxLength: 2000,
          decoration: const InputDecoration(
            labelText: 'Lý do hủy *',
            hintText: 'Nhập lý do hủy phiếu...',
          ),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: _submitting ? null : () => Navigator.of(context).pop(),
        child: const Text('Bỏ qua'),
      ),
      FilledButton(
        key: const Key('confirm-cancel-request'),
        onPressed: _submitting ? null : _submit,
        style: FilledButton.styleFrom(backgroundColor: AppColors.berry),
        child: _submitting
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Xác nhận hủy'),
      ),
    ],
  );
}

/// Dialog to confirm cancellation of a Return Request.
class CancelReturnRequestDialog extends StatefulWidget {
  const CancelReturnRequestDialog({
    super.key,
    required this.repo,
    required this.request,
    required this.onCancelled,
  });

  final WorkspaceRepository repo;
  final PartReturnRequest request;
  final VoidCallback onCancelled;

  static Future<void> show(
    BuildContext context, {
    required WorkspaceRepository repo,
    required PartReturnRequest request,
    required VoidCallback onCancelled,
  }) => showDialog<void>(
    context: context,
    builder: (ctx) => CancelReturnRequestDialog(
      repo: repo,
      request: request,
      onCancelled: onCancelled,
    ),
  );

  @override
  State<CancelReturnRequestDialog> createState() => _CancelReturnRequestDialogState();
}

class _CancelReturnRequestDialogState extends State<CancelReturnRequestDialog> {
  final _reasonController = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'Vui lòng nhập lý do hủy đề nghị.');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await widget.repo.cancelReturnRequest(
        widget.request.id,
        expectedVersion: widget.request.version,
        reason: reason,
      );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã hủy đề nghị trả kho thành công.')),
        );
        widget.onCancelled();
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Không thể hủy đề nghị (${e.code}). Vui lòng kiểm tra lại.';
        });
      }
    } catch (e, st) {
      debugPrint('CreateReturnRequest error: $e\n$st');
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Hủy đề nghị trả kho'),
    content: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Bạn có chắc muốn hủy đề nghị ${widget.request.requestNo}?'),
        const SizedBox(height: 12),
        if (_error != null) ...[
          Text(
            _error!,
            style: const TextStyle(color: AppColors.berry, fontSize: 13),
          ),
          const SizedBox(height: 8),
        ],
        TextField(
          key: const Key('cancel-return-reason-input'),
          controller: _reasonController,
          maxLines: 2,
          maxLength: 2000,
          decoration: const InputDecoration(
            labelText: 'Lý do hủy *',
            hintText: 'Nhập lý do hủy đề nghị...',
          ),
        ),
      ],
    ),
    actions: [
      TextButton(
        onPressed: _submitting ? null : () => Navigator.of(context).pop(),
        child: const Text('Bỏ qua'),
      ),
      FilledButton(
        key: const Key('confirm-cancel-return'),
        onPressed: _submitting ? null : _submit,
        style: FilledButton.styleFrom(backgroundColor: AppColors.berry),
        child: _submitting
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const Text('Xác nhận hủy'),
      ),
    ],
  );
}
