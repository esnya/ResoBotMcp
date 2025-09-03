import { OscSender, loadOscTargetFromEnv } from '../gateway/OscSender.js';
import { WebSocketRpcServer, wsConfigFromEnv } from '../gateway/WebSocketRpc.js';
import { OscReceiver, oscIngressConfigFromEnv } from '../gateway/OscReceiver.js';
import { PoseTracker } from '../gateway/PoseTracker.js';
import { ArmContactTracker } from '../gateway/ArmContactTracker.js';
import { scoped } from '../logging.js';
import { ADDR } from '../gateway/addresses.js';

export type AppContext = {
  oscSender: OscSender;
  wsServer: WebSocketRpcServer;
  poseTracker: PoseTracker;
  oscIngress: OscReceiver;
  armContact: ArmContactTracker;
};

export function createAppContext(): AppContext {
  const oscTarget = loadOscTargetFromEnv();
  const log = scoped('bootstrap');
  log.info({ osc: oscTarget }, 'server starting');

  const oscSender = new OscSender(oscTarget);
  const wsServer = new WebSocketRpcServer(wsConfigFromEnv());
  const poseTracker = new PoseTracker();
  const armContact = new ArmContactTracker();
  const oscIngress = new OscReceiver(oscIngressConfigFromEnv());

  oscIngress.register(ADDR.pose.position, (args) => {
    const [x, y, z] = args as number[];
    poseTracker.updatePosition(Number(x), Number(y), Number(z));
    scoped('osc:position').debug({ x: Number(x), y: Number(y), z: Number(z) }, 'position updated');
  });
  oscIngress.register(ADDR.pose.rotation, (args) => {
    const [heading, pitch] = args as number[];
    poseTracker.updateRotation(Number(heading), Number(pitch));
    scoped('osc:rotation').debug(
      { heading: Number(heading), pitch: Number(pitch) },
      'rotation updated',
    );
  });

  oscIngress.register(ADDR.arm.contact.meta, (args) => {
    const [meta] = args as unknown[];
    if (typeof meta === 'string') {
      armContact.updateMeta(meta);
      scoped('osc:arm-contact').debug({ meta }, 'arm meta updated');
    }
  });
  oscIngress.register(ADDR.arm.contact.grabbed, (args) => {
    const [flag] = args as unknown[];
    const grabbed = typeof flag === 'number' ? Number(flag) !== 0 : Boolean(flag);
    armContact.updateGrabbed(grabbed);
    scoped('osc:arm-contact').debug({ grabbed }, 'arm grabbed updated');
  });

  wsServer.register('ping', (args) => {
    const text = typeof args['text'] === 'string' ? args['text'] : '';
    return { text };
  });

  return { oscSender, wsServer, poseTracker, oscIngress, armContact };
}
