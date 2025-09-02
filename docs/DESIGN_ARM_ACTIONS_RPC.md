# Design: Arm Grab/Release via RPC

Purpose: Model arm grasp actions as instantaneous RPC commands instead of a persistent OSC state. This aligns semantics (momentary action vs. toggle) and simplifies Resonite-side logic.

Scope & Boundaries:

- Replace the previous `set_arm_grab` OSC toggle with two WS RPC methods executed by the Resonite client.
- Keep OSC ingress for arm contact state (`/virtualbot/arm/contact/*`) unchanged.

Public API / Contract:

- MCP tools
  - `arm_grab` (no arguments): triggers grab action.
  - `arm_release` (no arguments): triggers release action.
- WS RPC methods (client-implemented)
  - `arm_grab`: no args; returns `{}` on success.
  - `arm_release`: no args; returns `{}` on success.

Placement:

- Tool registrations: `src/server/tools.ts`.
- Tool contracts: `src/tools/contracts.ts`.
- WS transport: `src/gateway/WebSocketRpc.ts` (unchanged); methods are invoked from tools and implemented on the Resonite side.

Error Model:

- Standard WS RPC errors per `PROTOCOL_WS_RPC.md` (`status=error`, human-readable `message`). Tools surface concise text on success, and MCP errors as `isError` when applicable.

Migration:

- Remove tool `set_arm_grab` in favor of `arm_grab` and `arm_release`.
- Remove unused OSC address `ADDR.arm.grab`.
- Resonite client must implement WS RPC handlers for `arm_grab` and `arm_release`.

Testing Strategy:

- Unit: typecheck/lint and contracts compile.
- Integration: invoke tools against a Resonite client stub that handles the two RPC methods and verify no transport errors.
