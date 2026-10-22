# Movable active-workout overlay

The user requested a movable overlay that does not block bottom tabs. Keep the
existing full-width summary and rest/resume controls. Anchor it above the actual
tab-bar height, including its safe area, instead of a platform constant. A distinct
44-point handle moves it vertically; constrain it between the top safe area and
the tab bar. Preserve position across tab changes, reset for a new workout, and
re-clamp after resizing. Dragging must not resume the workout. Keep existing
scroll clearance and expose accessible move-up/down actions.

Reuse the app's existing React Native responder/Animated primitives. Adding new
native gesture dependencies would require another development client; this fix
must reach the currently connected client through Metro. Update only transform
values while dragging, with no per-frame React state, momentum or decoration.
