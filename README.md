# CF800-11H Heated Grip & Seat Coder

This tool is a web page for the CFMOTO CF800-11H. It enables the factory functions for the heated grips and the heated seat in the instrument cluster. It uses an OBDLink CX adapter and a Bluetooth Low Energy connection. The tool operates only in the browser of your phone. It is not necessary to install software or to create an account. The tool does not send data from your phone to the internet.

**Open the tool:** <https://cfmoto-web-coding.your-subdomain.workers.dev/>

> **Disclaimer.** This community project is independent of CFMOTO. CFMOTO did not approve or endorse it.
>
> This tool is supplied "as is", without warranty of any kind (refer to [LICENSE](LICENSE)). A change to the configuration of your motorcycle can have an effect on your warranty. If you make the change incorrectly, a module can have an incorrect configuration. You use this tool fully at your own risk. Only you are responsible for all changes that you make to your motorcycle.

## What the tool does

The instrument cluster keeps its options in a 16-byte configuration record (UDS data identifier `F010`). The tool does these steps:

1. It reads the identification of the instrument cluster and the current configuration record.
2. It sets bit 4 (heated grips), bit 5 (heated seat) or both bits in byte 1. All other bytes stay exactly as the tool read them.
3. It writes the configuration record and resets the instrument cluster. Then it reads the configuration record again and compares it with the written value.

Before the first write, the tool saves the original F010 value in the browser storage of your phone. With this copy, *↺ Restore* can write the original configuration record to the instrument cluster again. If you delete the site data of the browser, you also delete this copy. If you use a different phone or a different browser, this copy is not available. Before the first write, also keep your own copy of the `current F010` value from the log. Step 3 of the procedure shows this value in the log.

## Supported motorcycles

This table shows the confirmed variants of the instrument cluster.

| Motorcycle model | Part number (`F187`) | Software version (`F195`) | Length of `F010` | Status |
|---|---|---|---|---|
| CFMOTO CF800-11H | `6WW9-171000-8000` | `SW.1.02.02` | 16 bytes | Confirmed (tested on a motorcycle) |

On the confirmed variant, a change of byte 1 from `00` to `30` sets bits 4 and 5 together. This change enables the menus for the heated grips and the heated seat. Both functions then operate. The two bits were tested together, not one at a time.

The tool can also read other instrument clusters. If the part number or the length of the configuration record is not in the table, the tool shows a ⚠ warning. Before step 4 of the procedure writes to such an instrument cluster, the tool asks for an additional confirmation. Refer to [Report a new instrument cluster](#report-a-new-instrument-cluster).

## Requirements

- An Android phone with Chrome or Edge. Web Bluetooth is not available on iOS or in Safari. The page address must start with `https://`.
- An **OBDLink CX** adapter. Web Bluetooth supports only Bluetooth Low Energy devices. The tool does not support other OBDLink models.
- A battery charger or a battery maintainer. This document uses the term "battery charger" for both. Keep the battery charger connected to the motorcycle until the procedure is complete.

## Procedure

Open <https://cfmoto-web-coding.your-subdomain.workers.dev/> in Chrome or Edge on your Android phone. Read the notice at the top of the page. Then select the check box in the *Before you start* section. When you select this check box, you accept that you are fully responsible for all changes that you make to your motorcycle. You cannot select *① Connect to OBDLink CX* until you select this check box.

Do the steps below in sequence. After each step, read the result below the button of that step. The status bar above step 1 stays at the top of the screen. It also shows the latest result. A ✓ result means that the step is complete. If the result shows ⚠ or ✗, do the instructions in the result. If the result does not show an instruction, do the step again. If the problem continues, select *Copy log* and report the problem. The log at the bottom of the page shows all details.

1. **Connect.** Make sure that the battery charger is connected to the motorcycle. Set the ignition switch to ON. Do not start the engine. Connect the OBDLink CX adapter to the diagnostic connector.

   Select *① Connect to OBDLink CX*. Select the OBDLink CX adapter in the list of Bluetooth devices. If the phone asks for a PIN, enter `123456`.
2. **Unlock.** Select *② Start session and unlock*. The tool starts an extended diagnostic session with the instrument cluster. Then it unlocks the instrument cluster with the security access handshake.
3. **Read configuration.** Select *③ Read configuration*. The tool reads the identification of the instrument cluster and the configuration record. It shows the status (on or off) of the heated grips and the heated seat in the configuration record. It also shows ✓ for a confirmed variant or ⚠ for an unconfirmed instrument cluster. Before the first write, keep a copy of the `current F010` value from the log. You can use this value with *↺ Restore*.
4. **Select and write.** The *Heated grips* and *Heated seat* check boxes are selected by default. To enable only one function, clear the check box of the other function.

   **Caution:** Do not set the ignition switch to OFF during the write procedure. Do not disconnect the adapter during the write procedure. If you do one of these actions, the configuration in the instrument cluster can be unknown or incomplete. The write procedure starts when you select *OK* in the last confirmation dialog. It ends when the result below the ④ button shows ✓, ⚠ or ✗.

   Select *④ Write configuration and reset*. The tool shows a confirmation dialog with the new `F010` value and the value that the instrument cluster contains now. If these values are correct, select *OK*. If they are not correct, select *Cancel*. If a second dialog shows *⚠ UNCONFIRMED INSTRUMENT CLUSTER*, select *OK* only if you accept the risk.

   The tool then unlocks the instrument cluster again. It tests if the adapter can send a multi-frame message (long-message test). Then it writes the configuration record and resets the instrument cluster. Then it reads the configuration record again and compares it with the written value.

When the result below the ④ button shows ✓ Verified, set the ignition switch to OFF. Wait a few seconds. Then set the ignition switch to ON again. The menu of the instrument cluster then shows the option for each function that you enabled. Test each function that you enabled.

If the result below the ④ button shows ⚠ or ✗, do the instructions in that result. Do not write again before you read the result.

We recommend that you do a **dry run** before you do step 4 for the first time. After step 1, select *↪ Dry run (read-only)* below the *③ Read configuration* button. The dry run does steps 2 and 3. It also tests if the adapter can send a multi-frame message (long-message test). It does not write to the instrument cluster and does not make step 4 available. After a dry run, do step 3 before you do step 4.

## Rollback

*↺ Restore* writes the original configuration record to the instrument cluster again. It uses the same write procedure as step 4. To restore the original configuration record, do these steps:

1. Make sure that the ① button and the ② button show ✓.
2. Select *③ Read configuration*. *↺ Restore* is available only after this new read.
3. Look at the field next to *↺ Restore*. If the tool saved the original F010 value before the first write, the field already contains this value. Make sure that this value is the same as the `current F010` value from before the first write.
4. If the field is empty, enter the `current F010` value from before the first write.
5. Select *↺ Restore*. If the values in the confirmation dialog are correct, select *OK*. If they are not correct, select *Cancel*.

The value in the field must have the same length as the configuration record in the instrument cluster. If the length is different, the tool does not write.

The browser keeps the saved original F010 value for each web address. If you used this tool at the earlier address `untiring1337.github.io/cfmoto-web-coding`, your original F010 value is saved at that address. The tool at the current address cannot see this value. To get the value, do these steps:

1. Open <https://untiring1337.github.io/cfmoto-web-coding/> on the same phone, in the same browser. This address now shows the preview version of the tool. Do not use the preview version on your motorcycle.
2. Find the saved original F010 value in the notice at the top of the page. Select *Copy*.
3. Open the tool at <https://cfmoto-web-coding.your-subdomain.workers.dev/>. Do the rollback steps above. In step 4, paste the value into the field next to *↺ Restore*.

## Safety measures

- Step 4 changes only bits 4 and 5 of byte 1. The tool always writes the full configuration record, with the same length as the configuration record that it read.
- Immediately before each write, the tool unlocks the instrument cluster again and tests if the adapter can send a multi-frame message (long-message test).
- After each write, the tool resets the instrument cluster. Then it reads the configuration record again and compares it with the written value. If the values are not the same, the tool blocks all writes until you do step 1 again.
- If the result of a write is not known, the tool blocks all writes until a new read in step 3 is successful.
- Before the first write, the tool saves the original F010 value. The tool never replaces this saved value automatically.

## Report a new instrument cluster

You can help to add support for another motorcycle model or instrument cluster variant. Do these steps:

1. Do the **Connect** step of the procedure.
2. Select *↪ Dry run (read-only)*.
3. Select *Copy log*.
4. Open a new issue in this repository.
5. Paste the log into the issue.
6. Add the motorcycle model and the model year to the issue.

The log contains the part number (`F187`), the software version (`F195`) and the length of the configuration record.

## How the tool works

- **Transport:** The tool uses Web Bluetooth to send ELM327/STN commands to the OBDLink CX. It uses GATT service `FFF0`, with notifications on `FFF1` and writes on `FFF2`.
- **Protocol:** The protocol is UDS over ISO-TP on CAN, with 11-bit identifiers at 500 kbit/s. The instrument cluster uses request ID `0x714` and response ID `0x794`. The body control module uses request ID `0x715` and response ID `0x795`.
- **Session and security:** `10 03` starts the extended diagnostic session. For security access, `27 01` requests the seed and `27 02` sends the key.
- **Read:** The tool sends `22 F010`. For the multi-frame response, explicit flow control is necessary (`ATFCSH`, `ATFCSD`, `ATFCSM1`).
- **Write:** The tool sends `2E F010` and the configuration record. This request uses more than one CAN frame. For this reason, the tool sends it with the STN `STPX` command. The `STCFCPA` flow-control pairs let the adapter accept the flow-control frames from the instrument cluster.
- **Completion:** `11 01` (ECU reset) resets the instrument cluster. Then the tool reads `F010` again and compares it with the written value.

## Development

For the branches, the preview version, the release procedure and the tests, refer to [CONTRIBUTING.md](CONTRIBUTING.md).

## License

The [MIT License](LICENSE) applies to this project.

CFMOTO and all product names are trademarks of their owners. This project uses these names only for identification.
