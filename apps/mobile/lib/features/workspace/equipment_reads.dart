import 'dart:async';

import 'package:flutter/material.dart';

import '../../ui/components.dart';
import '../../ui/theme.dart';
import 'job_reads.dart';
import 'read_widgets.dart';
import 'workspace_repository.dart';

class EquipmentReads extends StatefulWidget {
  const EquipmentReads({super.key, required this.repo, this.revision = 0});
  final WorkspaceRepository repo;
  final int revision;
  @override
  State<EquipmentReads> createState() => _EquipmentReadsState();
}

class _EquipmentReadsState extends State<EquipmentReads> {
  String _q = '', _warranty = '', _status = '', _condition = '';
  Json? _customer, _site;
  int _page = 1, _revision = 0;
  final _search = TextEditingController();
  Timer? _debounce;
  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = {
      'page': '$_page',
      'pageSize': '20',
      'sort': 'assetCode',
      if (_q.isNotEmpty) 'q': _q,
      if (_warranty.isNotEmpty) 'warranty': _warranty,
      if (_status.isNotEmpty) 'status': _status,
      if (_condition.isNotEmpty) 'operationalStatus': _condition,
      if (_customer != null) 'customerId': text(_customer!, 'id'),
      if (_site != null) 'siteId': text(_site!, 'id'),
    };
    return ReadList(
      refresh: () async => setState(() => _revision++),
      children: [
        PageHeading(
          'Thiết bị',
          subtitle: 'Dữ liệu trong phạm vi quyền của tài khoản',
          action: RoundIcon(
            Icons.qr_code_scanner,
            label: 'Tra QR',
            onTap: () => openPage(context, QrReadScreen(repo: widget.repo)),
          ),
        ),
        TextField(
          controller: _search,
          key: const Key('equipment-search'),
          maxLength: 100,
          decoration: const InputDecoration(
            hintText: 'Mã thiết bị, serial hoặc tên model',
            prefixIcon: Icon(Icons.search),
            counterText: '',
          ),
          onChanged: (v) {
            _debounce?.cancel();
            _debounce = Timer(const Duration(milliseconds: 350), () {
              if (mounted) {
                setState(() {
                  _q = v.trim();
                  _page = 1;
                });
              }
            });
          },
        ),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            _filter('Bảo hành', _warranty, const [
              'IN_WARRANTY',
              'OUT_OF_WARRANTY',
              'NO_WARRANTY',
            ], (v) => _warranty = v),
            _filter('Trạng thái', _status, const [
              'ACTIVE',
              'INACTIVE',
              'RETIRED',
            ], (v) => _status = v),
            _filter('Vận hành', _condition, const [
              'UNKNOWN',
              'OPERATIONAL',
              'DEGRADED',
              'NOT_OPERATIONAL',
            ], (v) => _condition = v),
            OutlinedButton(
              onPressed: () async {
                final result = await Navigator.of(context).push<Json>(
                  MaterialPageRoute(
                    builder: (_) => CustomerPicker(repo: widget.repo),
                  ),
                );
                if (mounted && result != null) {
                  setState(() {
                    _customer = result;
                    _site = null;
                    _page = 1;
                  });
                }
              },
              child: Text(
                _customer == null ? 'Khách hàng' : text(_customer!, 'name'),
              ),
            ),
            if (_customer != null)
              OutlinedButton(
                onPressed: () async {
                  final result = await Navigator.of(context).push<Json>(
                    MaterialPageRoute(
                      builder: (_) => SitePicker(
                        repo: widget.repo,
                        customerId: text(_customer!, 'id'),
                      ),
                    ),
                  );
                  if (mounted && result != null) {
                    setState(() {
                      _site = result;
                      _page = 1;
                    });
                  }
                },
                child: Text(
                  _site == null ? 'Địa điểm khách hàng' : text(_site!, 'name'),
                ),
              ),
            if (_customer != null ||
                _site != null ||
                _warranty.isNotEmpty ||
                _status.isNotEmpty ||
                _condition.isNotEmpty)
              TextButton(
                onPressed: () => setState(() {
                  _customer = null;
                  _site = null;
                  _warranty = _status = _condition = '';
                  _page = 1;
                }),
                child: const Text('Xóa bộ lọc'),
              ),
          ],
        ),
        ReadView<PageData<Equipment>>(
          requestKey: '${widget.revision}/$_revision/$query',
          load: () => widget.repo.equipmentPage(query),
          builder: (page) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (page.items.isEmpty)
                const Notice('Không có thiết bị phù hợp.')
              else
                ...page.items.map(
                  (e) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: EquipmentSummary(
                      equipment: e,
                      onTap: () => openPage(
                        context,
                        EquipmentReadScreen(repo: widget.repo, id: e.id),
                      ),
                    ),
                  ),
                ),
              PageButtons(
                page: page.page,
                total: page.total,
                pageSize: page.pageSize,
                onPage: (p) => setState(() => _page = p),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _filter(
    String title,
    String value,
    List<String> values,
    ValueChanged<String> change,
  ) => SizedBox(
    width: MediaQuery.sizeOf(context).width < 360
        ? MediaQuery.sizeOf(context).width - 40
        : 280,
    child: DropdownButton<String>(
      isExpanded: true,
      value: value,
      items: [
        DropdownMenuItem(value: '', child: Text(title)),
        ...values.map((s) => DropdownMenuItem(value: s, child: Text(label(s)))),
      ],
      onChanged: (v) => setState(() {
        change(v ?? '');
        _page = 1;
      }),
    ),
  );
}

class EquipmentSummary extends StatelessWidget {
  const EquipmentSummary({
    super.key,
    required this.equipment,
    required this.onTap,
  });
  final Equipment equipment;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => SoftCard(
    onTap: onTap,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.precision_manufacturing_outlined,
          size: 36,
          color: AppColors.teal,
        ),
        const SizedBox(height: 12),
        Text(equipment.name, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(equipment.code),
        Text('Serial: ${text(equipment.data, 'serialNumber')}'),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            statusPill(text(equipment.data, 'status')),
            statusPill(text(equipment.data, 'operationalStatus')),
          ],
        ),
      ],
    ),
  );
}

class OrganizationSections extends StatelessWidget {
  const OrganizationSections({super.key, required this.dossier});
  final Json dossier;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const SectionTitle('Khách hàng'),
      SectionView(
        section: nested(dossier, 'customer'),
        builder: (v) {
          final c = object(v);
          return DataCard(
            text(c, 'name'),
            fields: {
              'Mã': c['code'],
              'Điện thoại': c['phone'],
              'Email': c['email'],
              'Địa chỉ': c['address'],
            },
          );
        },
      ),
      const SectionTitle('Địa điểm và vị trí'),
      SectionView(
        section: nested(dossier, 'site'),
        builder: (v) {
          final s = object(v);
          return DataCard(
            text(s, 'name'),
            fields: {
              'Mã địa điểm': s['code'],
              'Địa chỉ': s['address'],
              'Điện thoại': s['phone'],
            },
          );
        },
      ),
      const SizedBox(height: 12),
      SectionView(
        section: nested(dossier, 'location'),
        builder: (v) => v == null
            ? const Notice('Thiết bị chưa được gán vị trí chi tiết.')
            : DataCard(
                'Vị trí',
                fields: {
                  'Tên': object(v)['name'],
                  'Mô tả': object(v)['description'],
                },
              ),
      ),
      const SectionTitle('Liên hệ'),
      SectionView(
        section: nested(dossier, 'contacts'),
        builder: (v) {
          final contacts = rows(v);
          return contacts.isEmpty
              ? const Notice('Chưa có người liên hệ.')
              : Column(
                  children: [
                    for (final c in contacts)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: DataCard(
                          text(c, 'name'),
                          fields: {
                            'Chức vụ': c['position'],
                            'Điện thoại': c['phone'],
                            'Email': c['email'],
                            'Liên hệ chính': c['isPrimary'] == true
                                ? 'Có'
                                : 'Không',
                          },
                        ),
                      ),
                  ],
                );
        },
      ),
    ],
  );
}

class EquipmentReadScreen extends StatefulWidget {
  const EquipmentReadScreen({super.key, required this.repo, required this.id});
  final WorkspaceRepository repo;
  final String id;
  @override
  State<EquipmentReadScreen> createState() => _EquipmentReadScreenState();
}

class _EquipmentReadScreenState extends State<EquipmentReadScreen>
    with WidgetsBindingObserver {
  int _tab = 0, _revision = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      setState(() => _revision++);
    }
  }

  Future<void> _refresh() async => setState(() => _revision++);
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Hồ sơ thiết bị',
    actions: [
      IconButton(
        tooltip: 'Tải lại',
        onPressed: _refresh,
        icon: const Icon(Icons.refresh),
      ),
    ],
    child: ReadList(
      refresh: _refresh,
      children: [
        ReadView<Json>(
          requestKey: _revision,
          load: () => widget.repo.dossier(widget.id),
          builder: (d) {
            final e = Equipment(object(d['equipment'])),
                model = nested(e.data, 'model');
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                PageHeading(
                  e.name,
                  subtitle: '${e.code} · ${text(e.data, 'serialNumber')}',
                ),
                const SizedBox(height: 16),
                ChoicePills(
                  labels: const [
                    'Tổng quan',
                    'Thông số',
                    'Bảo hành',
                    'Lịch sử',
                    'Liên quan',
                  ],
                  selected: _tab,
                  onSelected: (i) => setState(() => _tab = i),
                ),
                const SizedBox(height: 20),
                if (_tab == 0) ...[
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      statusPill(text(e.data, 'status')),
                      statusPill(text(e.data, 'operationalStatus')),
                    ],
                  ),
                  const SizedBox(height: 16),
                  DataCard(
                    'Hồ sơ',
                    fields: {
                      'Mô tả': e.data['description'],
                      'Lắp đặt': dateText(e.data['installationDate']),
                      'Bàn giao': dateText(e.data['handoverDate']),
                      'Vận hành lần đầu': dateText(e.data['commissionedDate']),
                      'Xác nhận tình trạng lúc': dateText(
                        e.data['operationalStatusUpdatedAt'],
                        time: true,
                      ),
                      'Ghi chú': 'Tình trạng là xác nhận được lưu, không phải giám sát sức khỏe thời gian thực.',
                    },
                  ),
                  const SizedBox(height: 16),
                  OrganizationSections(dossier: d),
                  const SizedBox(height: 16),
                  Text(
                    'Dữ liệu tổng hợp lúc ${dateText(d['asOf'], time: true)}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
                if (_tab == 1) ...[
                  DataCard(
                    'Model thiết bị',
                    fields: {
                      'Tên': model['name'],
                      'Mã model': model['modelCode'],
                      'Hãng': model['manufacturer'],
                      'Danh mục': model['category'],
                      'Mô tả': model['description'],
                    },
                  ),
                  const SizedBox(height: 16),
                  if (nested(e.data, 'technicalSpecifications').isEmpty)
                    const Notice(
                      'Chưa có thông số kỹ thuật riêng cho thiết bị.',
                    )
                  else
                    DataCard(
                      'Thông số kỹ thuật',
                      fields: nested(e.data, 'technicalSpecifications'),
                    ),
                ],
                if (_tab == 2) ...[
                  statusPill(text(nested(d, 'calendarCoverage'), 'result')),
                  const SizedBox(height: 16),
                  const Notice(
                    'Bảo hành theo ngày không thay thế kết luận xét bảo hành tại Service Request.',
                  ),
                  const SizedBox(height: 16),
                  if (rows(d['warranties']).isEmpty)
                    const Notice('Chưa có bản ghi bảo hành.')
                  else
                    for (final w in rows(d['warranties']))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: DataCard(
                          text(w, 'warrantyType', 'Bảo hành'),
                          fields: {
                            'Bắt đầu': dateText(w['startDate']),
                            'Kết thúc': dateText(w['endDate']),
                            'Điều khoản': w['terms'],
                          },
                        ),
                      ),
                ],
                if (_tab == 3)
                  TimelineReads(
                    key: ValueKey('timeline/$_revision'),
                    repo: widget.repo,
                    equipmentId: widget.id,
                  ),
                if (_tab == 4) ...[
                  const SectionTitle('Work Order liên quan'),
                  LinkedReads(
                    key: ValueKey('orders/$_revision'),
                    repo: widget.repo,
                    equipmentId: widget.id,
                    orders: true,
                  ),
                  const SectionTitle('Yêu cầu dịch vụ liên quan'),
                  LinkedReads(
                    key: ValueKey('requests/$_revision'),
                    repo: widget.repo,
                    equipmentId: widget.id,
                    orders: false,
                  ),
                  const SectionTitle('Bảo trì'),
                  SectionView(
                    section: nested(d, 'maintenance'),
                    builder: (v) =>
                        DataCard('Tổng quan bảo trì', fields: object(v)),
                  ),
                ],
              ],
            );
          },
        ),
      ],
    ),
  );
}

class TimelineReads extends StatefulWidget {
  const TimelineReads({
    super.key,
    required this.repo,
    required this.equipmentId,
  });
  final WorkspaceRepository repo;
  final String equipmentId;
  @override
  State<TimelineReads> createState() => _TimelineReadsState();
}

class _TimelineReadsState extends State<TimelineReads> {
  int _page = 1;
  @override
  Widget build(BuildContext context) => ReadView<PageData<Json>>(
    requestKey: _page,
    load: () async => PageData.parse(
      await widget.repo.read(
        widget.repo.path(
          '${WorkspaceRepository.asset}/equipment/${widget.equipmentId}/timeline',
          {'page': '$_page', 'pageSize': '20', 'sort': '-occurredAt'},
        ),
      ),
      (j) => j,
    ),
    builder: (page) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Notice(
          'Lịch sử do Asset ghi nhận qua thay đổi và event. Bản ghi cũ có thể chưa đầy đủ; dữ liệu có thể trễ so với dịch vụ nguồn.',
        ),
        const SizedBox(height: 16),
        if (page.items.isEmpty)
          const Notice('Chưa ghi nhận lịch sử thiết bị.')
        else
          for (final event in page.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DataCard(
                    label(text(event, 'eventType')),
                    fields: {
                      'Thời gian xảy ra': dateText(
                        event['occurredAt'],
                        time: true,
                      ),
                      'Ghi nhận lúc': dateText(event['recordedAt'], time: true),
                      'Nội dung': event['description'],
                      'Ghi chú khách hàng': event['customerNote'],
                      'Lý do nội bộ': event['reasonInternal'],
                      'Người thực hiện': actor(
                        text(event, 'createdBy'),
                        widget.repo,
                      ),
                      'Kết quả': nested(event, 'metadata')['result'] == null
                          ? null
                          : label(text(nested(event, 'metadata'), 'result')),
                      'Tóm tắt xử lý': nested(
                        event,
                        'metadata',
                      )['customerSummary'],
                      'Chuyển trạng thái':
                          nested(event, 'metadata')['toStatus'] == null
                          ? null
                          : '${label(text(nested(event, 'metadata'), 'fromStatus'))} → ${label(text(nested(event, 'metadata'), 'toStatus'))}',
                    },
                  ),
                  if (event['referenceId'] is String &&
                      [
                        'WORK_ORDER',
                        'SERVICE_REQUEST',
                      ].contains(event['referenceType']))
                    TextButton(
                      onPressed: () => openPage(
                        context,
                        event['referenceType'] == 'WORK_ORDER'
                            ? JobReadScreen(
                                repo: widget.repo,
                                id: event['referenceId'] as String,
                              )
                            : RequestReadScreen(
                                repo: widget.repo,
                                equipmentId: widget.equipmentId,
                                id: event['referenceId'] as String,
                              ),
                      ),
                      child: const Text('Xem hồ sơ nguồn'),
                    ),
                ],
              ),
            ),
        PageButtons(
          page: page.page,
          total: page.total,
          pageSize: page.pageSize,
          onPage: (p) => setState(() => _page = p),
        ),
      ],
    ),
  );
}

class LinkedReads extends StatefulWidget {
  const LinkedReads({
    super.key,
    required this.repo,
    required this.equipmentId,
    required this.orders,
  });
  final WorkspaceRepository repo;
  final String equipmentId;
  final bool orders;
  @override
  State<LinkedReads> createState() => _LinkedReadsState();
}

class _LinkedReadsState extends State<LinkedReads> {
  int _page = 1;
  @override
  Widget build(BuildContext context) => ReadView<Json>(
    requestKey: _page,
    load: () => widget.repo.get(
      widget.repo.path(
        '${WorkspaceRepository.asset}/equipment/${widget.equipmentId}/${widget.orders ? 'work-orders' : 'service-requests'}',
        {'page': '$_page', 'pageSize': '10'},
      ),
    ),
    builder: (section) => SectionView(
      section: section,
      builder: (value) {
        final page = PageData.parse(value, (j) => j);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (page.items.isEmpty)
              const Notice('Không có hồ sơ liên quan trong phạm vi quyền.')
            else
              ...page.items.map(
                (r) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: widget.orders
                      ? WorkCard(
                          WorkOrder(r),
                          onTap: () => openPage(
                            context,
                            JobReadScreen(repo: widget.repo, id: text(r, 'id')),
                          ),
                        )
                      : SoftCard(
                          onTap: () => openPage(
                            context,
                            RequestReadScreen(
                              repo: widget.repo,
                              equipmentId: widget.equipmentId,
                              id: text(r, 'id'),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(text(r, 'requestNo')),
                              const SizedBox(height: 8),
                              Text(text(r, 'title')),
                              const SizedBox(height: 12),
                              statusPill(text(r, 'status')),
                            ],
                          ),
                        ),
                ),
              ),
            PageButtons(
              page: page.page,
              total: page.total,
              pageSize: page.pageSize,
              onPage: (p) => setState(() => _page = p),
            ),
          ],
        );
      },
    ),
  );
}

class QrReadScreen extends StatefulWidget {
  const QrReadScreen({super.key, required this.repo});
  final WorkspaceRepository repo;
  @override
  State<QrReadScreen> createState() => _QrReadScreenState();
}

class _QrReadScreenState extends State<QrReadScreen> {
  final _code = TextEditingController();
  String? _token, _validation;
  int _revision = 0;
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _resolve() {
    var token = _code.text.trim();
    final uri = Uri.tryParse(token);
    if (uri != null &&
        uri.hasScheme &&
        uri.pathSegments.length >= 3 &&
        uri.pathSegments[uri.pathSegments.length - 2] == 'qr') {
      token = uri.pathSegments.last;
    }
    setState(() {
      _validation = RegExp(r'^[A-Za-z0-9_-]{22,255}$').hasMatch(token)
          ? null
          : 'Nhập token hoặc đường dẫn QR hợp lệ.';
      _token = _validation == null ? token : null;
      _revision++;
    });
  }

  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Tra thiết bị bằng QR',
    child: ReadList(
      children: [
        const Notice(
          'Nhập token hoặc dán đường dẫn QR để tra cứu có xác thực. Camera sẽ được kết nối ở bước tiếp theo.',
        ),
        TextField(
          controller: _code,
          maxLength: 2000,
          autocorrect: false,
          decoration: InputDecoration(
            labelText: 'Mã QR / đường dẫn',
            errorText: _validation,
            counterText: '',
          ),
          onSubmitted: (_) => _resolve(),
        ),
        FilledButton(onPressed: _resolve, child: const Text('Tra cứu')),
        if (_token != null)
          ReadView<Equipment>(
            requestKey: _revision,
            load: () => widget.repo.resolveQr(_token!),
            builder: (e) => EquipmentSummary(
              equipment: e,
              onTap: () => openPage(
                context,
                EquipmentReadScreen(repo: widget.repo, id: e.id),
              ),
            ),
          ),
      ],
    ),
  );
}

class CustomerPicker extends StatefulWidget {
  const CustomerPicker({super.key, required this.repo});
  final WorkspaceRepository repo;
  @override
  State<CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<CustomerPicker> {
  int _page = 1;
  String _q = '';
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Chọn khách hàng',
    child: ReadList(
      children: [
        TextField(
          maxLength: 100,
          decoration: const InputDecoration(
            hintText: 'Tìm theo tên hoặc mã',
            prefixIcon: Icon(Icons.search),
          ),
          onSubmitted: (q) => setState(() {
            _q = q.trim();
            _page = 1;
          }),
        ),
        ReadView<PageData<Json>>(
          requestKey: '$_page/$_q',
          load: () async => PageData.parse(
            await widget.repo.read(
              widget.repo.path('/api/organization/customers', {
                'page': '$_page',
                'pageSize': '20',
                if (_q.isNotEmpty) 'q': _q,
              }),
            ),
            (j) => j,
          ),
          builder: (page) => Column(
            children: [
              if (page.items.isEmpty)
                const Notice('Không có khách hàng phù hợp.'),
              ...page.items.map(
                (c) => ListTile(
                  title: Text(text(c, 'name')),
                  subtitle: Text(text(c, 'code')),
                  onTap: () => Navigator.pop(context, c),
                ),
              ),
              PageButtons(
                page: page.page,
                total: page.total,
                pageSize: page.pageSize,
                onPage: (p) => setState(() => _page = p),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class SitePicker extends StatelessWidget {
  const SitePicker({super.key, required this.repo, required this.customerId});
  final WorkspaceRepository repo;
  final String customerId;
  @override
  Widget build(BuildContext context) => ReadPage(
    title: 'Chọn địa điểm khách hàng',
    child: ReadList(
      children: [
        ReadView<List<Json>>(
          load: () =>
              repo.list('/api/organization/customers/$customerId/sites'),
          builder: (sites) => sites.isEmpty
              ? const Notice('Khách hàng chưa có địa điểm.')
              : Column(
                  children: [
                    for (final s in sites)
                      ListTile(
                        title: Text(text(s, 'name')),
                        subtitle: Text(text(s, 'address')),
                        onTap: () => Navigator.pop(context, s),
                      ),
                  ],
                ),
        ),
      ],
    ),
  );
}
