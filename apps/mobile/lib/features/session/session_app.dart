import 'dart:async';

import 'package:flutter/material.dart';

import '../../ui/theme.dart';
import '../workspace/live_workspace.dart';
import 'session_controller.dart';

class TechnicianApp extends StatefulWidget {
  const TechnicianApp({
    super.key,
    required this.session,
    this.disposeSession = false,
  });
  final SessionController session;
  final bool disposeSession;

  @override
  State<TechnicianApp> createState() => _TechnicianAppState();
}

class _TechnicianAppState extends State<TechnicianApp>
    with WidgetsBindingObserver {
  final _workspaceNavigator = GlobalKey<NavigatorState>();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(widget.session.restore());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(widget.session.revalidate());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    if (widget.disposeSession) widget.session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'PBL6 Technician',
    debugShowCheckedModeBanner: false,
    theme: technicianTheme(),
    home: AnimatedBuilder(
      animation: widget.session,
      builder: (context, _) => switch (widget.session.phase) {
        SessionPhase.loading => const Scaffold(
          body: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('Đang kiểm tra phiên…'),
              ],
            ),
          ),
        ),
        SessionPhase.signedOut => _LoginPage(session: widget.session),
        SessionPhase.authenticated => _workspace(),
        SessionPhase.unavailable => _RecoveryPage(session: widget.session),
      },
    ),
  );

  Widget _workspace() => NavigatorPopHandler<Object?>(
    // Respect the child route's PopScope (dirty report / in-flight command).
    // Calling pop() here forces a pop and bypasses that route's disposition.
    onPopWithResult: (_) {
      final navigator = _workspaceNavigator.currentState;
      if (navigator != null) unawaited(navigator.maybePop());
    },
    child: Navigator(
      key: _workspaceNavigator,
      onGenerateRoute: (_) => MaterialPageRoute<void>(
        builder: (_) => AnimatedBuilder(
          animation: widget.session,
          builder: (context, _) {
            final user = widget.session.user;
            if (user == null) return const SizedBox.shrink();
            return LiveWorkspace(
              key: ValueKey(
                '${user.tenantId}/${user.id}/${user.roles.join(',')}',
              ),
              session: widget.session,
            );
          },
        ),
      ),
    ),
  );
}

class _LoginPage extends StatefulWidget {
  const _LoginPage({required this.session});
  final SessionController session;
  @override
  State<_LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<_LoginPage> {
  final _form = GlobalKey<FormState>();
  final _tenant = TextEditingController(text: 'DEMO');
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  Future<void> _submit() async {
    if (widget.session.busy || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    await widget.session.login(
      tenantCode: _tenant.text,
      email: _email.text,
      password: _password.text,
    );
    if (mounted && widget.session.phase == SessionPhase.authenticated) {
      _password.clear();
    }
  }

  @override
  void dispose() {
    _tenant.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: AutofillGroup(
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(
                      Icons.handyman_outlined,
                      size: 52,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'PBL6 Technician',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Đăng nhập để bắt đầu ca làm việc',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 32),
                    if (widget.session.message != null) ...[
                      _Notice(widget.session.message!),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                      key: const Key('tenant'),
                      controller: _tenant,
                      enabled: !widget.session.busy,
                      decoration: const InputDecoration(
                        labelText: 'Mã doanh nghiệp',
                      ),
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      validator: (v) =>
                          v == null || v.trim().isEmpty || v.trim().length > 50
                          ? 'Nhập mã doanh nghiệp (tối đa 50 ký tự).'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('email'),
                      controller: _email,
                      enabled: !widget.session.busy,
                      decoration: const InputDecoration(labelText: 'Email'),
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      textInputAction: TextInputAction.next,
                      autocorrect: false,
                      textCapitalization: TextCapitalization.none,
                      validator: (v) =>
                          v == null ||
                              v.trim().length > 255 ||
                              !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                  .hasMatch(v.trim())
                          ? 'Nhập email hợp lệ.'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      key: const Key('password'),
                      controller: _password,
                      enabled: !widget.session.busy,
                      obscureText: _obscure,
                      enableSuggestions: false,
                      autocorrect: false,
                      autofillHints: const [AutofillHints.password],
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => unawaited(_submit()),
                      decoration: InputDecoration(
                        labelText: 'Mật khẩu',
                        suffixIcon: IconButton(
                          onPressed: widget.session.busy
                              ? null
                              : () => setState(() => _obscure = !_obscure),
                          tooltip: _obscure ? 'Hiện mật khẩu' : 'Ẩn mật khẩu',
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      validator: (v) => v == null || v.isEmpty || v.length > 128
                          ? 'Nhập mật khẩu (tối đa 128 ký tự).'
                          : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      key: const Key('login'),
                      onPressed: widget.session.busy ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          widget.session.busy ? 'Đang đăng nhập…' : 'Đăng nhập',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _RecoveryPage extends StatelessWidget {
  const _RecoveryPage({required this.session});
  final SessionController session;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 48),
              const SizedBox(height: 16),
              Text(
                session.message ?? 'Chưa kiểm tra được phiên.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: session.busy ? null : session.restore,
                child: const Text('Thử lại'),
              ),
              TextButton(
                onPressed: session.busy ? null : session.logout,
                child: const Text('Xóa phiên trên máy'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text),
    ),
  );
}
