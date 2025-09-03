import { OscSender } from '../gateway/OscSender.js';
import { WebSocketRpcServer } from '../gateway/WebSocketRpc.js';
import { OscReceiver } from '../gateway/OscReceiver.js';
import { PoseTracker } from '../gateway/PoseTracker.js';
import { ArmContactTracker } from '../gateway/ArmContactTracker.js';
import { scoped } from '../logging.js';
import { ADDR } from '../gateway/addresses.js';
import { loadAppConfigFromEnv } from './config.js';
import { VisualLogSession } from '../usecases/VisualLogSession.js';
import {
  PosePositionArgsSchema,
  PoseRotationArgsSchema,
  ArmContactMetaArgsSchema,
  ArmContactGrabbedArgsSchema,
} from '../schemas/osc.js';

export type AppContext = {
  oscSender: OscSender;
  wsServer: WebSocketRpcServer;
  poseTracker: PoseTracker;
  oscIngress: OscReceiver;
  armContact: ArmContactTracker;
  visualLog: VisualLogSession;
};

export function createAppContext(): AppContext {
  // Aggregate and validate env at the boundary.
  const appConfig = loadAppConfigFromEnv();
  const oscTarget = appConfig.oscEgress;
  const log = scoped('bootstrap');
  log.info({ osc: oscTarget }, 'server starting');

  const oscSender = new OscSender(oscTarget);
  const wsServer = new WebSocketRpcServer(appConfig.ws);
  const poseTracker = new PoseTracker();
  const armContact = new ArmContactTracker();
  const oscIngress = new OscReceiver(appConfig.oscIngress);
  const visualLog = new VisualLogSession({
    dir: appConfig.visualLog.dir,
    flushMs: appConfig.visualLog.flushMs,
    textCoalesceMs: appConfig.visualLog.textCoalesceMs,
  });
  // best-effort init (async; don't block startup)
  void visualLog.init();

  oscIngress.register(ADDR.pose.position, (raw) => {
    const [x, y, z] = PosePositionArgsSchema.parse(raw);
    poseTracker.updatePosition(x, y, z);
    scoped('osc:position').debug({ x, y, z }, 'position updated');
    const p = poseTracker.get();
    if (p) visualLog.recordPose(p);
  });
  oscIngress.register(ADDR.pose.rotation, (raw) => {
    const [heading, pitch] = PoseRotationArgsSchema.parse(raw);
    poseTracker.updateRotation(heading, pitch);
    scoped('osc:rotation').debug({ heading, pitch }, 'rotation updated');
    const p = poseTracker.get();
    if (p) visualLog.recordPose(p);
  });

  oscIngress.register(ADDR.arm.contact.meta, (raw) => {
    const [meta] = ArmContactMetaArgsSchema.parse(raw);
    armContact.updateMeta(meta);
    scoped('osc:arm-contact').debug({ meta }, 'arm meta updated');
  });
  oscIngress.register(ADDR.arm.contact.grabbed, (raw) => {
    const [flag] = ArmContactGrabbedArgsSchema.parse(raw);
    const grabbed = typeof flag === 'number' ? flag !== 0 : Boolean(flag);
    armContact.updateGrabbed(grabbed);
    scoped('osc:arm-contact').debug({ grabbed }, 'arm grabbed updated');
  });

  wsServer.register('ping', (args) => {
    const text = typeof args['text'] === 'string' ? args['text'] : '';
    return { text };
  });

  return { oscSender, wsServer, poseTracker, oscIngress, armContact, visualLog };
}
