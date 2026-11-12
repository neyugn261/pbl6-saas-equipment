import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../ui/theme.dart';

class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];

  List<List<Offset>> get strokes => List.unmodifiable(_strokes);

  bool get isEmpty => _strokes.isEmpty || _strokes.every((s) => s.isEmpty);
  bool get isNotEmpty => !isEmpty;

  void startStroke(Offset point) {
    _strokes.add([point]);
    notifyListeners();
  }

  void addPoint(Offset point) {
    if (_strokes.isEmpty) {
      _strokes.add([point]);
    } else {
      _strokes.last.add(point);
    }
    notifyListeners();
  }

  void endStroke() {
    notifyListeners();
  }

  void clear() {
    _strokes.clear();
    notifyListeners();
  }

  Future<Uint8List?> toPngBytes({
    Size size = const Size(500, 250),
    Color backgroundColor = Colors.white,
    Color penColor = AppColors.ink,
  }) async {
    if (isEmpty) return null;

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(
      recorder,
      Rect.fromLTWH(0, 0, size.width, size.height),
    );

    // Draw background
    final bgPaint = Paint()..color = backgroundColor;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), bgPaint);

    // Draw strokes
    final paint = Paint()
      ..color = penColor
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in _strokes) {
      if (stroke.isEmpty) continue;
      if (stroke.length == 1) {
        canvas.drawCircle(stroke.first, 1.5, paint..style = PaintingStyle.fill);
        paint.style = PaintingStyle.stroke;
      } else {
        final path = Path();
        path.moveTo(stroke.first.dx, stroke.first.dy);
        for (int i = 1; i < stroke.length; i++) {
          path.lineTo(stroke[i].dx, stroke[i].dy);
        }
        canvas.drawPath(path, paint);
      }
    }

    final picture = recorder.endRecording();
    final img = await picture.toImage(size.width.toInt(), size.height.toInt());
    final byteData = await img.toByteData(format: ui.ImageByteFormat.png);
    return byteData?.buffer.asUint8List();
  }
}

class SignaturePainter extends CustomPainter {
  SignaturePainter({
    required this.strokes,
    this.color = AppColors.ink,
    this.strokeWidth = 2.5,
  });

  final List<List<Offset>> strokes;
  final Color color;
  final double strokeWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    for (final stroke in strokes) {
      if (stroke.isEmpty) continue;
      if (stroke.length == 1) {
        canvas.drawCircle(stroke.first, strokeWidth / 2, paint..style = PaintingStyle.fill);
        paint.style = PaintingStyle.stroke;
      } else {
        final path = Path();
        path.moveTo(stroke.first.dx, stroke.first.dy);
        for (int i = 1; i < stroke.length; i++) {
          path.lineTo(stroke[i].dx, stroke[i].dy);
        }
        canvas.drawPath(path, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant SignaturePainter oldDelegate) => true;
}

class SignaturePad extends StatelessWidget {
  const SignaturePad({
    super.key,
    required this.controller,
    this.height = 180,
    this.penColor,
    this.backgroundColor,
    this.enabled = true,
  });

  final SignatureController controller;
  final double height;
  final Color? penColor;
  final Color? backgroundColor;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final bg = backgroundColor ?? (dark ? const Color(0xff1e2523) : Colors.white);
    final ink = penColor ?? (dark ? Colors.white : AppColors.ink);
    final border = theme.colorScheme.outlineVariant;

    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final hasSignature = controller.isNotEmpty;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              height: height,
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: hasSignature ? theme.colorScheme.primary : border,
                  width: hasSignature ? 1.5 : 1.0,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(11),
                child: Stack(
                  children: [
                    // Watermark / Instructions when empty
                    if (!hasSignature)
                      Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.gesture,
                              size: 32,
                              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Khách hàng ký tên vào khung này',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
                              ),
                            ),
                          ],
                        ),
                      ),

                    // Gesture drawing layer
                    Positioned.fill(
                      child: RawGestureDetector(
                        key: const Key('signature-pad-gesture'),
                        behavior: HitTestBehavior.opaque,
                        gestures: enabled
                            ? {
                                _SignatureGestureRecognizer:
                                    GestureRecognizerFactoryWithHandlers<
                                      _SignatureGestureRecognizer
                                    >(
                                      () => _SignatureGestureRecognizer(
                                        onStart: controller.startStroke,
                                        onUpdate: controller.addPoint,
                                        onEnd: controller.endStroke,
                                      ),
                                      (_SignatureGestureRecognizer instance) {
                                        instance
                                          ..onStart = controller.startStroke
                                          ..onUpdate = controller.addPoint
                                          ..onEnd = controller.endStroke;
                                      },
                                    ),
                              }
                            : const {},
                        child: CustomPaint(
                          painter: SignaturePainter(
                            strokes: controller.strokes,
                            color: ink,
                          ),
                        ),
                      ),
                    ),

                    // Top control buttons (Clear)
                    if (hasSignature)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: IconButton.filledTonal(
                          key: const Key('signature-clear-btn'),
                          tooltip: 'Xóa ký lại',
                          icon: const Icon(Icons.refresh, size: 18),
                          onPressed: enabled ? controller.clear : null,
                        ),
                      ),

                    // Bottom indicator
                    Positioned(
                      bottom: 8,
                      right: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: hasSignature
                              ? AppColors.paleTeal
                              : theme.colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              hasSignature ? Icons.check_circle : Icons.edit_outlined,
                              size: 14,
                              color: hasSignature ? AppColors.teal : theme.colorScheme.onSurfaceVariant,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              hasSignature ? 'Đã ký nhận' : 'Chưa có chữ ký',
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: hasSignature ? AppColors.teal : theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SignatureGestureRecognizer extends OneSequenceGestureRecognizer {
  _SignatureGestureRecognizer({
    required this.onStart,
    required this.onUpdate,
    required this.onEnd,
  });

  void Function(Offset) onStart;
  void Function(Offset) onUpdate;
  VoidCallback onEnd;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    startTrackingPointer(event.pointer, event.transform);
    resolve(GestureDisposition.accepted);
    onStart(event.localPosition);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerMoveEvent) {
      onUpdate(event.localPosition);
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      stopTrackingPointer(event.pointer);
      onEnd();
    }
  }

  @override
  String get debugDescription => 'signature_gesture_recognizer';

  @override
  void didStopTrackingLastPointer(int pointer) {}
}
