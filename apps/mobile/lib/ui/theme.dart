import 'package:flutter/material.dart';

abstract final class AppColors {
  static const ink = Color(0xff171a1b);
  static const muted = Color(0xff828889);
  static const paper = Color(0xfff5f6f4);
  static const line = Color(0xffeceeed);
  static const teal = Color(0xff619fa3);
  static const peach = Color(0xfff6b77e);
  static const berry = Color(0xffad5678);
  static const violet = Color(0xff5547b5);
  static const paleTeal = Color(0xffeaf3f2);
  static const palePeach = Color(0xfffff1e3);
  static const paleBerry = Color(0xfff8edf1);
}

ThemeData technicianTheme() => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: Colors.white,
  colorScheme: ColorScheme.fromSeed(
    seedColor: AppColors.teal,
    primary: AppColors.violet,
    secondary: AppColors.teal,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    headlineLarge: TextStyle(
      fontSize: 34,
      fontWeight: FontWeight.w600,
      letterSpacing: -1.2,
      color: AppColors.ink,
    ),
    headlineMedium: TextStyle(
      fontSize: 28,
      fontWeight: FontWeight.w600,
      letterSpacing: -.9,
      color: AppColors.ink,
    ),
    headlineSmall: TextStyle(
      fontSize: 23,
      fontWeight: FontWeight.w600,
      letterSpacing: -.6,
      color: AppColors.ink,
    ),
    titleLarge: TextStyle(
      fontSize: 19,
      fontWeight: FontWeight.w600,
      letterSpacing: -.4,
      color: AppColors.ink,
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      color: AppColors.ink,
    ),
    bodyLarge: TextStyle(fontSize: 15, height: 1.5, color: AppColors.ink),
    bodyMedium: TextStyle(fontSize: 14, height: 1.45, color: AppColors.ink),
    bodySmall: TextStyle(fontSize: 12, height: 1.4, color: AppColors.muted),
    labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    foregroundColor: AppColors.ink,
    elevation: 0,
    centerTitle: true,
    titleTextStyle: TextStyle(
      fontSize: 15,
      fontWeight: FontWeight.w600,
      color: AppColors.ink,
    ),
  ),
  dividerTheme: const DividerThemeData(color: AppColors.line, space: 28),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    showDragHandle: true,
    dragHandleColor: AppColors.violet,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: AppColors.paper,
    contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(20),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(20),
      borderSide: BorderSide.none,
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(20),
      borderSide: const BorderSide(color: AppColors.teal),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(20),
      borderSide: const BorderSide(color: AppColors.berry),
    ),
    hintStyle: const TextStyle(color: AppColors.muted, fontSize: 14),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      backgroundColor: AppColors.violet,
      foregroundColor: Colors.white,
      minimumSize: const Size(0, 52),
      shape: const StadiumBorder(),
      textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: AppColors.ink,
      minimumSize: const Size(0, 50),
      side: const BorderSide(color: AppColors.line),
      shape: const StadiumBorder(),
    ),
  ),
  textButtonTheme: TextButtonThemeData(
    style: TextButton.styleFrom(foregroundColor: AppColors.teal),
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: Colors.white,
    surfaceTintColor: Colors.transparent,
    indicatorColor: AppColors.ink,
    height: 76,
    labelTextStyle: WidgetStateProperty.resolveWith(
      (states) => TextStyle(
        fontSize: 10,
        fontWeight: states.contains(WidgetState.selected)
            ? FontWeight.w700
            : FontWeight.w400,
        color: states.contains(WidgetState.selected)
            ? AppColors.ink
            : AppColors.muted,
      ),
    ),
    iconTheme: WidgetStateProperty.resolveWith(
      (states) => IconThemeData(
        size: 22,
        color: states.contains(WidgetState.selected)
            ? Colors.white
            : AppColors.muted,
      ),
    ),
  ),
);
