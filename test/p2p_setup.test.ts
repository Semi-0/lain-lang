import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { setupHost, setupPeer, cleanup, type HostConfig, type PeerConfig, type HostSetup, type PeerSetup } from "../src/p2p/setup";

// Helper to find available port
const findAvailablePort = async (startPort: number = 9000): Promise<number> => {
    const net = await import("net");
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = (server.address() as any)?.port;
            server.close(() => resolve(port || startPort));
        });
        server.on("error", () => {
            resolve(findAvailablePort(startPort + 1));
        });
    });
};

describe("p2p_setup", () => {
    let testHttpPort: number;
    let testMulticastPort: number;
    let testHostPort: number;

    beforeEach(async () => {
        // Use different ports for each test to avoid conflicts
        testHttpPort = await findAvailablePort(9000);
        testMulticastPort = await findAvailablePort(9100);
        testHostPort = await findAvailablePort(9200);
    });

    afterEach(() => {
        // Cleanup is handled in individual tests
    });

    describe("setupHost", () => {
        test("should create host setup with valid config", async () => {
            const config: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-env-id",
                enableTrace: false,
            };

            const setup = await setupHost(config);

            expect(setup).toBeDefined();
            expect(setup.server).toBeDefined();
            expect(setup.gun).toBeDefined();
            expect(setup.env).toBeDefined();
            expect(setup.executionInterval).toBeDefined();

            // Cleanup
            cleanup(setup);
        }, 10000);

        test("should create host setup with radisk enabled", async () => {
            const config: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-env-id-radisk",
                radisk: true,
                enableTrace: false,
            };

            const setup = await setupHost(config);

            expect(setup).toBeDefined();
            expect(setup.server).toBeDefined();

            cleanup(setup);
        }, 10000);

        test("should create host setup with trace enabled", async () => {
            const config: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-env-id-trace",
                enableTrace: true,
            };

            const setup = await setupHost(config);

            expect(setup).toBeDefined();
            expect(setup.server).toBeDefined();

            cleanup(setup);
        }, 10000);

        test("should use different envId for different hosts", async () => {
            const config1: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-env-1",
                enableTrace: false,
            };

            const config2: HostConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort + 1,
                envId: "test-env-2",
                enableTrace: false,
            };

            const setup1 = await setupHost(config1);
            const setup2 = await setupHost(config2);

            expect(setup1.env).toBeDefined();
            expect(setup2.env).toBeDefined();
            // Environments should be different instances
            expect(setup1.env).not.toBe(setup2.env);

            cleanup(setup1);
            cleanup(setup2);
        }, 15000);
    });

    describe("setupPeer", () => {
        test("should create peer setup with valid config", async () => {
            // First create a host
            const hostConfig: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-peer-env",
                enableTrace: false,
            };
            const hostSetup = await setupHost(hostConfig);

            // Wait a bit for host to be ready
            await new Promise(resolve => setTimeout(resolve, 2000));

            const peerConfig: PeerConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort,
                hostPeer: `http://localhost:${testHttpPort}/gun`,
                envId: "test-peer-env",
                enableTrace: false,
            };

            const peerSetup = await setupPeer(peerConfig);

            expect(peerSetup).toBeDefined();
            expect(peerSetup.server).toBeDefined();
            expect(peerSetup.gun).toBeDefined();
            expect(peerSetup.env).toBeDefined();
            expect(peerSetup.executionInterval).toBeDefined();

            cleanup(peerSetup);
            cleanup(hostSetup);
        }, 20000);

        test("should create peer setup with radisk enabled", async () => {
            const hostConfig: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-peer-env-radisk",
                enableTrace: false,
            };
            const hostSetup = await setupHost(hostConfig);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const peerConfig: PeerConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort,
                hostPeer: `http://localhost:${testHttpPort}/gun`,
                envId: "test-peer-env-radisk",
                radisk: true,
                enableTrace: false,
            };

            const peerSetup = await setupPeer(peerConfig);

            expect(peerSetup).toBeDefined();
            expect(peerSetup.server).toBeDefined();

            cleanup(peerSetup);
            cleanup(hostSetup);
        }, 20000);
    });

    describe("cleanup", () => {
        test("should cleanup host setup properly", async () => {
            const config: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-cleanup-env",
                enableTrace: false,
            };

            const setup = await setupHost(config);
            const intervalId = setup.executionInterval;

            // Verify interval exists
            expect(intervalId).toBeDefined();

            // Cleanup should not throw
            expect(() => cleanup(setup)).not.toThrow();

            // Interval should be cleared (we can't directly test this, but cleanup should succeed)
        }, 10000);

        test("should cleanup peer setup properly", async () => {
            const hostConfig: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-cleanup-peer-env",
                enableTrace: false,
            };
            const hostSetup = await setupHost(hostConfig);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const peerConfig: PeerConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort,
                hostPeer: `http://localhost:${testHttpPort}/gun`,
                envId: "test-cleanup-peer-env",
                enableTrace: false,
            };

            const peerSetup = await setupPeer(peerConfig);
            const intervalId = peerSetup.executionInterval;

            expect(intervalId).toBeDefined();
            expect(() => cleanup(peerSetup)).not.toThrow();
            expect(() => cleanup(hostSetup)).not.toThrow();
        }, 20000);

        test("should handle cleanup of multiple setups", async () => {
            const config1: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "test-multi-1",
                enableTrace: false,
            };

            const config2: HostConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort + 1,
                envId: "test-multi-2",
                enableTrace: false,
            };

            const setup1 = await setupHost(config1);
            const setup2 = await setupHost(config2);

            // Both should cleanup without errors
            expect(() => cleanup(setup1)).not.toThrow();
            expect(() => cleanup(setup2)).not.toThrow();
        }, 15000);
    });

    describe("configuration", () => {
        test("should accept minimal config for host", async () => {
            const config: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "minimal-config",
            };

            const setup = await setupHost(config);

            expect(setup).toBeDefined();
            expect(setup.server).toBeDefined();

            cleanup(setup);
        }, 10000);

        test("should accept minimal config for peer", async () => {
            const hostConfig: HostConfig = {
                httpPort: testHttpPort,
                multicastPort: testMulticastPort,
                envId: "minimal-peer-config",
                enableTrace: false,
            };
            const hostSetup = await setupHost(hostConfig);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const peerConfig: PeerConfig = {
                httpPort: testHostPort,
                multicastPort: testMulticastPort,
                hostPeer: `http://localhost:${testHttpPort}/gun`,
                envId: "minimal-peer-config",
            };

            const peerSetup = await setupPeer(peerConfig);

            expect(peerSetup).toBeDefined();
            expect(peerSetup.server).toBeDefined();

            cleanup(peerSetup);
            cleanup(hostSetup);
        }, 20000);
    });
});
