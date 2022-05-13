import { connect } from 'amqplib';
import { imageExists, pullImageAsync } from 'dockerode-utils';
import Docker from 'dockerode';

const CONTAINER_IMAGE = 'rabbitmq:3.8-alpine';
const CONTAINER_NAME = 'cardano-rabbitmq-test';

export const removeContainer = async () => {
  const docker = new Docker();
  try {
    const container = await docker.getContainer(CONTAINER_NAME);
    try {
      await container.stop();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      // 304 = container already stopped
      if (error.statusCode !== 304) throw error;
    }
    await container.remove({ v: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // 404 = container not found
    if (error.statusCode !== 404) throw error;
  }
};

export const setupContainer = async () => {
  const docker = new Docker();
  const needsToPull = !(await imageExists(docker, CONTAINER_IMAGE));
  if (needsToPull) await pullImageAsync(docker, CONTAINER_IMAGE);
  await removeContainer();
  const container = await docker.createContainer({
    HostConfig: { PortBindings: { '5672/tcp': [{ HostPort: '5672/tcp' }] } },
    Image: CONTAINER_IMAGE,
    name: CONTAINER_NAME
  });
  await container.start();

  // Once the container starts it is not immediately ready to accept connections
  // this waits for that short delay
  await new Promise<void>(async (resolve) => {
    // eslint-disable-next-line no-constant-condition
    while (true)
      try {
        await connect('amqp://localhost');
        return resolve();
        // eslint-disable-next-line no-empty
      } catch {}
  });
};
