import { OscSender, loadOscTargetFromEnv } from '../gateway/OscSender.js';
import { SendTextViaOsc } from '../usecases/SendTextViaOsc.js';
import { WebSocketRpcServer, wsConfigFromEnv } from '../gateway/WebSocketRpc.js';
import { OscReceiver, oscIngressConfigFromEnv } from '../gateway/OscReceiver.js';
import { PoseTracker } from '../gateway/PoseTracker.js';
import { scoped } from '../logging.js';

export type AppContext = {
  oscSender: OscSender;
  sendTextViaOsc: SendTextViaOsc;
  wsServer: WebSocketRpcServer;
  poseTracker: PoseTracker;
  oscIngress: OscReceiver;
};

export function createAppContext(): AppContext {
  const oscTarget = loadOscTargetFromEnv();
  const log = scoped('bootstrap');
  log.info({ osc: oscTarget }, 'server starting');

  const oscSender = new OscSender(oscTarget);
  const sendTextViaOsc = new SendTextViaOsc(oscSender);
  const wsServer = new WebSocketRpcServer(wsConfigFromEnv());
  const poseTracker = new PoseTracker();
  const oscIngress = new OscReceiver(oscIngressConfigFromEnv());

  // Wire OSC ingress to pose tracker
  oscIngress.register('/virtualbot/position', (args) => {
    const [x, y, z] = args as number[];
    poseTracker.updatePosition(Number(x), Number(y), Number(z));
    scoped('osc:position').debug({ x: Number(x), y: Number(y), z: Number(z) }, 'position updated');
  });
  oscIngress.register('/virtualbot/rotation', (args) => {
    const [heading, pitch] = args as number[];
    poseTracker.updateRotation(Number(heading), Number(pitch));
    scoped('osc:rotation').debug(
      { heading: Number(heading), pitch: Number(pitch) },
      'rotation updated',
    );
  });

  // Register minimal WS RPC methods (server side)
  wsServer.register('ping', (args) => {
    const text = typeof args['text'] === 'string' ? args['text'] : '';
    return { text };
  });

  return { oscSender, sendTextViaOsc, wsServer, poseTracker, oscIngress };
}
