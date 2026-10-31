# CF800-11H Heated Grip & Seat Coder

A browser-based tool that enables the factory heated-grip and heated-seat functions in the instrument cluster of the CFMOTO CF800-11H, using an OBDLink CX adapter over Bluetooth LE. It runs entirely on your phone: no installation, no account, no data leaves the device.

**Open the tool:** <https://untiring1337.github.io/cfmoto-web-coding/>

> **Disclaimer.** This is an independent community project. It is not affiliated with, authorised by or endorsed by CFMOTO. The software is provided as is, without warranty of any kind (see [LICENSE](LICENSE)). Changing vehicle configuration may affect your warranty and, if done incorrectly, can leave a module misconfigured. You use this tool entirely at your own risk and are solely responsible for any change made to your vehicle.

## What it does

The instrument cluster stores its option configuration in a 16-byte record (UDS data identifier `F010`). The tool:

1. reads the cluster's identification and its current configuration record;
2. sets bit 4 (heated grips) and/or bit 5 (heated seat) of byte 1, leaving every other byte exactly as read;
3. writes the record back, resets the cluster and reads the record again to verify the change.

Before the first write, the original record is saved in the phone's browser storage so that it can be written back with Restore. This copy is lost if the browser's site data is cleared or a different phone or browser is used, so also keep the `current F010` value logged in step 3.

## Supported vehicles

| Model | Cluster part number (`F187`) | Cluster software (`F195`) | `F010` length | Status |
|---|---|---|---|---|
| CFMOTO CF800-11H | `6WW9-171000-8000` | `SW.1.02.02` | 16 bytes | Verified on a vehicle |

On the verified cluster, setting bits 4 and 5 together (byte 1 `00` → `30`) enables the heated-grip and heated-seat menus, and both functions operate. The bits were validated together, not individually.

Other clusters can be read, but the tool shows a prominent warning and asks for an additional confirmation before writing to a part number or record length that is not listed above. See [Reporting a new cluster](#reporting-a-new-cluster).

## Requirements

- An Android phone with Chrome or Edge. Web Bluetooth is not available on iOS or in Safari, and the page must be opened over `https://`.
- An **OBDLink CX** adapter. Web Bluetooth only supports Bluetooth Low Energy devices; other OBDLink models are not supported.
- A battery charger or maintainer connected to the motorcycle for the entire procedure.

## Usage

Open <https://untiring1337.github.io/cfmoto-web-coding/> in Chrome on your Android phone, read the notice and tick the acknowledgement box.

1. **Connect.** Switch the ignition on (engine off), plug the OBDLink CX into the diagnostic port and tap *Connect*. Pair with PIN `123456` if prompted.
2. **Unlock.** Opens an extended diagnostic session and performs the security-access handshake.
3. **Read configuration.** Reads the cluster identification and the configuration record, shows the current heating settings and whether the cluster is a verified variant. Note the logged `current F010` value.
4. **Write.** Select heated grips and/or heated seat and tap *Write config & reset*. The tool unlocks again, tests the adapter's multi-frame transmit path, writes, resets the cluster and verifies the result.

Afterwards, switch the ignition off for a few seconds and back on. The heated-grip and heated-seat options appear in the dashboard menu.

The **dry run** (step 3) performs steps 2 and 3 plus the transmit test without writing anything. It is recommended before the first write.

## Rollback

*Restore* writes the original record back using the same verified procedure. The record saved on the device before the first write is pre-filled; alternatively, enter the `current F010` value from a log recorded before the first write. A fresh read (step 3) is required, and the length must match the cluster's record.

## Safety measures

- Only bits 4 and 5 of byte 1 are modified; the full record is written back with the same length.
- The cluster is unlocked again immediately before each write, and the adapter's multi-frame path is tested first.
- Every write is followed by a reset and a read-back comparison. A mismatch blocks further writes until the adapter is reconnected.
- If the outcome of a write cannot be confirmed, further writes are blocked until the configuration has been read again.
- The original record is stored before the first write and is never overwritten automatically.

## Reporting a new cluster

To help add another model or cluster variant, run the **dry run**, tap **Copy log** and open an issue in this repository with the log. The log contains the cluster part number (`F187`), software version (`F195`) and the configuration record length. Please also state the motorcycle model and model year.

## How it works

- **Transport:** Web Bluetooth to the OBDLink CX (GATT service `FFF0`, notifications on `FFF1`, writes on `FFF2`), using ELM327/STN commands.
- **Protocol:** UDS over ISO-TP on CAN 11-bit, 500 kbit/s. Instrument cluster request/response IDs `0x714`/`0x794`; body control module `0x715`/`0x795`.
- **Session and security:** `10 03` extended session, `27 01`/`27 02` seed/key security access.
- **Read:** `22 F010`. The multi-frame response requires explicit flow control (`ATFCSH`, `ATFCSD`, `ATFCSM1`).
- **Write:** `2E F010` + record. The request spans several CAN frames, so it is sent with the STN `STPX` command; `STCFCPA` flow-control pairs let the adapter accept the cluster's flow-control frames.
- **Completion:** `11 01` ECU reset, followed by a read-back of `F010`.

## License

Released under the [MIT License](LICENSE).

CFMOTO and all product names are trademarks of their respective owners and are used here for identification only.
