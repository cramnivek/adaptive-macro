# Workout overlay implementation plan

**Goal:** Move the active-workout overlay without covering navigation.

1. Test pure bounds/clamping against tall Android tab bars, top insets, resized
   windows and oversized overlays; observe failure before implementation.
2. Measure the existing BottomTabBar and tab frame. Pass those measurements to
   FloatingWorkoutBar, replacing the fixed bottom offset.
3. Add the bounded drag handle and accessible step actions with existing native
   primitives. Retain rest/resume behavior and scroll clearance.
4. Run focused tests, workspace types, platform exports and browser interaction
   checks. Review the diff and push the feature branch without merging main.
