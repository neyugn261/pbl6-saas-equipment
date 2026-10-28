import 'package:flutter/material.dart';

import 'equipment_screens.dart';
import 'home_screen.dart';
import 'jobs_screen.dart';
import 'preview_data.dart';
import 'profile_screen.dart';
import 'schedule_screen.dart';
import 'theme.dart';

/// Presentation shell; all new business views use local sample data. Session
/// callbacks may be supplied by the existing authenticated P0 entry point.
class TechnicianWorkspace extends StatefulWidget {
  const TechnicianWorkspace({
    super.key,
    this.name = 'Khương',
    this.email = 'technician@demo.local',
    this.onLogout,
    this.onCheckSession,
    this.sessionBusy = false,
    this.sessionMessage,
  });
  final String name, email;
  final VoidCallback? onLogout, onCheckSession;
  final bool sessionBusy;
  final String? sessionMessage;
  @override
  State<TechnicianWorkspace> createState() => _TechnicianWorkspaceState();
}

class _TechnicianWorkspaceState extends State<TechnicianWorkspace> {
  int _index = 0, _filterRevision = 0;
  JobStage? _jobFilter;
  void _showJobs(JobStage? stage) => setState(() {
    _jobFilter = stage;
    _filterRevision++;
    _index = 1;
  });

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      bottom: false,
      child: IndexedStack(
        index: _index,
        children: [
          HomeScreen(
            name: widget.name,
            onJobs: _showJobs,
            onSchedule: () => setState(() => _index = 2),
            onEquipment: () => setState(() => _index = 3),
          ),
          JobsScreen(filter: _jobFilter, filterRevision: _filterRevision),
          const ScheduleScreen(),
          const EquipmentScreen(),
          ProfileScreen(
            name: widget.name,
            email: widget.email,
            onLogout: widget.onLogout,
            onCheckSession: widget.onCheckSession,
            busy: widget.sessionBusy,
            message: widget.sessionMessage,
          ),
        ],
      ),
    ),
    bottomNavigationBar: DecoratedBox(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      child: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            key: Key('nav-home'),
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Trang chủ',
          ),
          NavigationDestination(
            key: Key('nav-jobs'),
            icon: Icon(Icons.work_outline_rounded),
            selectedIcon: Icon(Icons.work_rounded),
            label: 'Công việc',
          ),
          NavigationDestination(
            key: Key('nav-schedule'),
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_month_rounded),
            label: 'Lịch',
          ),
          NavigationDestination(
            key: Key('nav-equipment'),
            icon: Icon(Icons.precision_manufacturing_outlined),
            selectedIcon: Icon(Icons.precision_manufacturing_rounded),
            label: 'Thiết bị',
          ),
          NavigationDestination(
            key: Key('nav-profile'),
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Cá nhân',
          ),
        ],
      ),
    ),
  );
}

class TechnicianPreviewApp extends StatelessWidget {
  const TechnicianPreviewApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'PBL6 Technician · UI Preview',
    debugShowCheckedModeBanner: false,
    theme: technicianTheme(),
    home: const TechnicianWorkspace(),
  );
}
