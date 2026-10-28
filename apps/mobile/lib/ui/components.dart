import 'package:flutter/material.dart';

import 'preview_data.dart';
import 'theme.dart';

void openPage(BuildContext context, Widget page) =>
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page));

// TODO(mobile-api): replace per-feature callbacks with scoped repository commands.
// This notice deliberately leaves fixtures unchanged and never claims persistence.
void previewAction(BuildContext context, String action) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(
              Icons.design_services_outlined,
              size: 36,
              color: AppColors.violet,
            ),
            const SizedBox(height: 16),
            Text(
              action,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            const Text(
              'Đây là bản xem trước giao diện. Thao tác chưa gửi hoặc thay đổi dữ liệu.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Đã hiểu'),
            ),
          ],
        ),
      ),
    ),
  );
}

class PreviewTag extends StatelessWidget {
  const PreviewTag({super.key});
  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.circle, size: 5, color: AppColors.teal),
      SizedBox(width: 5),
      Flexible(
        child: Text(
          'Dữ liệu minh họa',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 10, color: AppColors.muted),
        ),
      ),
    ],
  );
}

class RoundIcon extends StatelessWidget {
  const RoundIcon(
    this.icon, {
    super.key,
    required this.onTap,
    required this.label,
    this.badge = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String label;
  final bool badge;
  @override
  Widget build(BuildContext context) => Tooltip(
    message: label,
    child: Stack(
      children: [
        IconButton(
          onPressed: onTap,
          tooltip: label,
          style: IconButton.styleFrom(
            backgroundColor: AppColors.paper,
            minimumSize: const Size(44, 44),
          ),
          icon: Icon(icon, size: 21, color: AppColors.ink),
        ),
        if (badge)
          const Positioned(
            top: 9,
            right: 10,
            child: CircleAvatar(radius: 3, backgroundColor: AppColors.berry),
          ),
      ],
    ),
  );
}

class UiPage extends StatelessWidget {
  const UiPage({
    super.key,
    required this.title,
    required this.child,
    this.bottom,
    this.actions,
    this.onBack,
  });
  final String title;
  final Widget child;
  final Widget? bottom;
  final List<Widget>? actions;
  final VoidCallback? onBack;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leadingWidth: 64,
      leading: Padding(
        padding: const EdgeInsets.only(left: 16),
        child: RoundIcon(
          Icons.arrow_back_ios_new_rounded,
          label: 'Quay lại',
          onTap: onBack ?? () => Navigator.maybePop(context),
        ),
      ),
      title: Text(title),
      actions: actions,
      bottom: const PreferredSize(
        preferredSize: Size.fromHeight(22),
        child: Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: PreviewTag(),
        ),
      ),
    ),
    body: SafeArea(top: false, child: child),
    bottomNavigationBar: bottom == null
        ? null
        : Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: AppColors.line)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
                child: bottom,
              ),
            ),
          ),
  );
}

class PageHeading extends StatelessWidget {
  const PageHeading(
    this.title, {
    super.key,
    this.eyebrow,
    this.subtitle,
    this.action,
  });
  final String title;
  final String? eyebrow, subtitle;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (eyebrow != null) ...[
        Text(eyebrow!, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 6),
      ],
      Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
          ),
          ?action,
        ],
      ),
      if (subtitle != null) ...[
        const SizedBox(height: 8),
        Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
      ],
    ],
  );
}

class SoftCard extends StatelessWidget {
  const SoftCard({
    super.key,
    required this.child,
    this.color = AppColors.paper,
    this.padding = const EdgeInsets.all(20),
    this.onTap,
  });
  final Widget child;
  final Color color;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: color,
    borderRadius: BorderRadius.circular(26),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(padding: padding, child: child),
    ),
  );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onTap});
  final String title;
  final String? action;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 14),
    child: Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (action != null)
          TextButton(
            onPressed: onTap,
            child: Text(action!, style: const TextStyle(fontSize: 12)),
          ),
      ],
    ),
  );
}

class Pill extends StatelessWidget {
  const Pill(
    this.text, {
    super.key,
    this.color = AppColors.teal,
    this.filled = false,
    this.icon,
  });
  final String text;
  final Color color;
  final bool filled;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: filled ? color : color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(30),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 12, color: filled ? Colors.white : color),
          const SizedBox(width: 5),
        ],
        Flexible(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: filled ? Colors.white : color,
            ),
          ),
        ),
      ],
    ),
  );
}

class ChoicePills extends StatelessWidget {
  const ChoicePills({
    super.key,
    required this.labels,
    required this.selected,
    required this.onSelected,
  });
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    child: Row(
      children: List.generate(
        labels.length,
        (i) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            label: Text(labels[i]),
            selected: i == selected,
            showCheckmark: false,
            onSelected: (_) => onSelected(i),
            selectedColor: AppColors.ink,
            backgroundColor: Colors.white,
            side: BorderSide(
              color: i == selected ? AppColors.ink : AppColors.line,
            ),
            shape: const StadiumBorder(),
            labelStyle: TextStyle(
              color: i == selected ? Colors.white : AppColors.muted,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
          ),
        ),
      ),
    ),
  );
}

class InfoRow extends StatelessWidget {
  const InfoRow(this.icon, this.title, this.value, {super.key, this.onTap});
  final IconData icon;
  final String title, value;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(14),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 19, color: AppColors.muted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          if (onTap != null)
            const Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: AppColors.muted,
            ),
        ],
      ),
    ),
  );
}

class JobCard extends StatelessWidget {
  const JobCard({
    super.key,
    required this.job,
    required this.onTap,
    this.compact = false,
  });
  final JobPreview job;
  final VoidCallback onTap;
  final bool compact;
  @override
  Widget build(BuildContext context) => SoftCard(
    onTap: onTap,
    padding: EdgeInsets.all(compact ? 16 : 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: job.color.withValues(alpha: .13),
                shape: BoxShape.circle,
              ),
              child: Icon(job.equipment.icon, color: job.color, size: 20),
            ),
            const Spacer(),
            Icon(Icons.north_east_rounded, size: 18, color: job.color),
          ],
        ),
        const SizedBox(height: 14),
        Text(job.id, style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 5),
        Text(
          job.title,
          maxLines: compact ? 2 : 3,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: compact ? 15 : 17,
            fontWeight: FontWeight.w600,
            height: 1.3,
            letterSpacing: -.3,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          job.equipment.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            Pill(job.stage.label, color: job.stage.color),
            if (!compact)
              Pill(
                job.priority,
                color: job.priority == 'Khẩn cấp'
                    ? AppColors.berry
                    : AppColors.muted,
              ),
          ],
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            const Icon(
              Icons.schedule_rounded,
              size: 14,
              color: AppColors.muted,
            ),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                job.time,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            if (!compact)
              Text(job.type, style: TextStyle(fontSize: 11, color: job.color)),
          ],
        ),
      ],
    ),
  );
}

class StatePanel extends StatelessWidget {
  const StatePanel({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox_outlined,
    this.action,
    this.onAction,
  });
  final String title, message;
  final IconData icon;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 40),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: const BoxDecoration(
            color: AppColors.paper,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 38, color: AppColors.teal),
        ),
        const SizedBox(height: 20),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        Text(
          message,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (action != null) ...[
          const SizedBox(height: 20),
          OutlinedButton(onPressed: onAction, child: Text(action!)),
        ],
      ],
    ),
  );
}

class EquipmentArt extends StatelessWidget {
  const EquipmentArt(this.equipment, {super.key, this.height = 180});
  final EquipmentPreview equipment;
  final double height;
  @override
  Widget build(BuildContext context) => Container(
    height: height,
    decoration: BoxDecoration(
      color: equipment.color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(26),
    ),
    child: Stack(
      alignment: Alignment.center,
      children: [
        Positioned(
          right: -20,
          top: -25,
          child: Container(
            width: 150,
            height: 150,
            decoration: BoxDecoration(
              color: equipment.color.withValues(alpha: .08),
              shape: BoxShape.circle,
            ),
          ),
        ),
        Positioned(
          left: 20,
          bottom: 20,
          child: Container(
            width: 65,
            height: 65,
            decoration: BoxDecoration(
              border: Border.all(color: equipment.color.withValues(alpha: .2)),
              shape: BoxShape.circle,
            ),
          ),
        ),
        Icon(equipment.icon, size: height * .48, color: equipment.color),
        const Positioned(
          bottom: 10,
          right: 15,
          child: Text(
            'Minh họa thiết bị',
            style: TextStyle(fontSize: 9, color: AppColors.muted),
          ),
        ),
      ],
    ),
  );
}

Future<void> reasonSheet(
  BuildContext context, {
  required String title,
  required String label,
}) async {
  final pageContext = context;
  final form = GlobalKey<FormState>();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          24,
          0,
          24,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Form(
          key: form,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(title, style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 20),
              TextFormField(
                key: const Key('reason-input'),
                maxLines: 4,
                maxLength: 2000,
                decoration: const InputDecoration(hintText: 'Nhập nội dung…'),
                validator: (v) => v == null || v.trim().isEmpty
                    ? 'Vui lòng nhập nội dung.'
                    : null,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () {
                  if (!form.currentState!.validate()) return;
                  Navigator.pop(context);
                  previewAction(pageContext, title);
                },
                child: const Text('Xác nhận'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
