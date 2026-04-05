import { describe, test, expect } from "bun:test"
import { setupHost, setupPeer, cleanup } from "../src/p2p/setup"
import { gun_cell_instance, gun_cell_receiver } from "../DB/serialize/gun_cell"
import { construct_propagator } from "ppropogator/Propagator/Propagator"
import { construct_cell, cell_strongest_base_value, update_cell } from "ppropogator/Cell/Cell"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"
import { the_nothing } from "ppropogator/Cell/CellValue"

// NOTE: This test proves Gun-backed cells can act as a cross-"node" message boundary:
// - host writes a value to a gun_cell_instance
// - peer observes strongest update via gun_cell_receiver
// - peer's local propagators are alerted and run via scheduler

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("gun_cell bridge", () => {
  test(
    "host update propagates to peer and triggers downstream propagation",
    async () => {
      const httpPort = 9400 + Math.floor(Math.random() * 200)
      const multicastPort = 9600 + Math.floor(Math.random() * 200)
      const peerPort = 9800 + Math.floor(Math.random() * 200)

      const envId = "gun-cell-bridge-env"

      const host = await setupHost({
        httpPort,
        multicastPort,
        envId,
        enableTrace: false,
      })

      await sleep(1500)

      const peer = await setupPeer({
        httpPort: peerPort,
        multicastPort,
        hostPeer: `http://localhost:${httpPort}/gun`,
        envId,
        enableTrace: false,
      })

      // Shared cell id across host/peer
      const cellId = "cell_x_shared"
      const hostX = gun_cell_instance<number>(host.gun, "x", cellId)
      const peerX = gun_cell_receiver<number>(peer.gun, "x", cellId)

      const peerY = construct_cell("y")

      // downstream: y := x + 1 (locally on peer)
      construct_propagator(
        [peerX],
        [peerY],
        () => {
          const x = cell_strongest_base_value(peerX)
          if (x === the_nothing || typeof x !== "number") return
          update_cell(peerY, x + 1)
        },
        "p_peer_plus1"
      )

      // write on host
      update_cell(hostX, 9)

      // give Gun time to sync and listeners time to fire, then drain scheduler
      await sleep(1200)
      execute_all_tasks_sequential(console.error)

      expect(cell_strongest_base_value(peerX)).toBe(9)
      expect(cell_strongest_base_value(peerY)).toBe(10)

      cleanup(peer)
      cleanup(host)
    },
    20000
  )
})

