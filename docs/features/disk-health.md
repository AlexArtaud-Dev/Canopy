# Disk health

Canopy shows the health of the server's disks from their own SMART data: a **Disk health** page
under Monitoring, a dashboard panel and metrics, and notifications when something changes.

## Setting it up

Reading SMART data needs access to the devices and root rights. The engine gets neither: a small
**disks service** does, and answers only the engine.

1. In `docker/compose.yaml`, give the engine the service's address and token:

   ```yaml
   engine:
     environment:
       CANOPY_DISKS_URL: http://disks:8091
       CANOPY_DISKS_TOKEN_FILE: /run/canopy/secrets/disks-token
   ```

2. Uncomment the `disks` service at the end of the file and list your disks under `devices`
   (`ls /dev/sd? /dev/nvme?`; an NVMe drive is `/dev/nvme0`, not `/dev/nvme0n1`).
3. `docker compose up -d`. Setup generates the token (`CANOPY_HOME/secrets/disks-token`) on its
   next run.

The service is the engine image's `disks` target (`ghcr.io/alexartaud-dev/canopy-disks`, or
`izoniks/canopy:<version>-disks`). It runs as root with every capability dropped but
`SYS_RAWIO` (SATA/SAS pass-through) and `SYS_ADMIN` (NVMe admin commands), a read-only file
system, on the internal network only. It reads no file, offers no shell, and refuses any call
without the token.

## What it shows

- **Page** (`/disks`, permission `metrics:disks`): a summary (failing, needing attention, too
  hot), then one card per disk, the worrying ones first:
  - model, device, size (decimal units, as disks are sold), kind (hard disk, SSD, NVMe);
  - a verdict: **Healthy**, **Needs attention**, **Failing** or **No SMART data** (virtual
    disks, some USB bridges), plus **Too hot** and **Asleep**;
  - why, in plain words: reallocated, pending or unreadable sectors, media errors, wear past 90 %,
    spare blocks below the drive's threshold, a failed self-test, the disk's own failing status
    or an NVMe critical warning;
  - temperature, age, starts, sector counters, cable (CRC) errors, NVMe spare and data written,
    serial number, firmware, wear as a bar.
- **Self-tests** (administrators): a quick test (minutes) or a full one (hours; the disk stays
  usable). Each runs as a job in the operations panel, with its progress; cancelling it stops the
  test, and a failed test fails the job (`disks.self_test_failed`). Audited as `jobs.start`.
- **Check now** (administrators) reads the disks at once (audited as `disks.check`).
- **Sleeping disks** are never woken up: smartctl skips them (`-n standby`) and the page keeps
  their last values, marked **Asleep**.

## Dashboards

- Panel type **Disk health**: each disk with its temperature and verdict, linking to the page.
  The **Server** preset adds it with a disk temperature chart, for those who may read the family.
- Metrics (family `disks`, one series per disk named by model and the end of its serial number):
  `disks.temperature` (°C, not sampled while a disk sleeps), `disks.wear` (%),
  `disks.reallocated`, `disks.pending`. See [metrics](metrics.md).

## Alerts

The engine compares each reading with the previous one and queues an alert when a disk becomes
**failing**, shows a **new** sign of damage or wear (a new reason, or more damaged sectors), or
gets **too hot**. A hot disk alerts again only after cooling 3 °C below its limit. A disk seen for
the first time alerts on what it already shows. Each change alerts once, never at every reading.

Every minute the web app claims the queued alerts (each once, even with several web instances)
and notifies everyone holding `metrics:disks` or administrator rights: one notification per disk
and kind, updated rather than repeated. Kinds: `diskFailing`, `diskWarning`, `diskHot`; they
lead to the page.

## Settings (Settings › General › Disk health)

| Setting                    | Default | Range    |
| -------------------------- | ------- | -------- |
| Check every (minutes)      | 15      | 5 – 1440 |
| Hard disks too hot from °C | 55      | 30 – 90  |
| SSDs too hot from °C       | 70      | 30 – 100 |

## How it works

- `apps/engine/internal/disks`: smartctl's JSON (`--scan-open`, `-a -n standby,0`) parsed into a
  summary and a verdict (pure, tested from real and sample outputs); the service's HTTP handler
  and the engine's client; the watcher (schedule, merge of sleeping disks, alerts); the self-test
  job. `diskstore` keeps the latest reading (`engine.disk_readings`) and the queued alerts
  (`engine.disk_alerts`, delivered ones kept 30 days).
- Device names and types only ever come from smartctl's own scan: a request names a disk by id
  (`sda`, `nvme0`), never by path. smartctl runs with an argv, never a shell.
- Engine API: `GET /v1/disks` (`metrics:disks`), `POST /v1/disks/check`,
  `POST /v1/disks/{disk}/self-test`, `POST /v1/disks/alerts/claim` (administrators). Errors:
  `disks.forbidden`, `disks.not_configured`, `disks.unavailable`, `disks.not_found`,
  `disks.invalid_test`.
- Without `CANOPY_DISKS_URL` nothing runs: the page explains how to set it up.
