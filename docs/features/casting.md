# Casting to a screen

Canopy plays videos on the TVs and screens of the network (Chromecast, Google TV, Apple TV,
DLNA smart TVs) through the [dapple](https://github.com/AlexArtaud-Dev/dapple) plugin. This
page goes from the compose file to the first film.

## What casting needs, and why

A screen does not receive the video from the browser: it **fetches it from the engine**, over
HTTP, while dapple drives it. Three things follow, none of them open in Canopy's default compose
file, which isolates the engine on purpose:

| Need                           | Why                                                                     | How                                                       |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| The engine reaches the screens | dapple talks to them (Cast, DLNA, AirPlay)                              | the engine joins a network that is not `internal`         |
| The screens reach the engine   | they download the video from dapple's media server                      | port **8690** of the engine is published on the host      |
| Screens are found              | discovery relies on multicast, which Docker bridge networks never carry | a **relay** on the host network lists the screens it sees |

The relay is the only service on the host network. It plays nothing, reads no file and answers
two questions: the screens it sees (`GET /devices`), and the address a screen reaches the host
at (`GET /address?for=<screen>`). dapple, inside the engine, asks it on its gateway, then on
`host.docker.internal` (Docker Desktop): nothing to set in Canopy.

## Compose

Add to `docker/compose.yaml` (the commented block at its end carries the same lines):

```yaml
services:
  engine:
    # …the engine as it is, plus:
    ports:
      - '8690:8690' # dapple's media server: the screens fetch videos here
    networks: [internal, cast]

  dapple-relay:
    image: ghcr.io/alexartaud-dev/dapple:latest
    # Listens on the gateway of the cast network only: the engine reaches it, nothing else.
    command: [relay, --listen, '10.250.31.1:8691']
    # The only service on the host network: finding screens needs multicast.
    network_mode: host
    user: '65532:65532'
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    restart: unless-stopped
    depends_on: [engine] # the cast network exists once the engine started

networks:
  cast:
    ipam:
      config:
        - subnet: 10.250.31.0/29
          gateway: 10.250.31.1
```

- **Subnet already used** (Portainer: "Pool overlaps with other one on this address space"):
  pick another small private range nobody uses (`docker network inspect $(docker network ls -q)
| grep Subnet` lists the taken ones) and change the relay's `--listen` address to its gateway.
- Behind a firewall on the host, allow inbound TCP 8690 from the screens' network.
- Another port than 8690: publish it, and set **Media server port** on the plugin's page.

## Install the plugin

1. **Administration › Plugins › Add plugins**: add the source `AlexArtaud-Dev/dapple` if it is
   not listed, then **Install** _Cast to a screen_. The engine image with ffmpeg
   (`…-engine-ffmpeg` or `…-engine-gpu`) converts on the fly what a screen cannot play; without
   it, files are sent as stored.
2. **Administration › Devices** (or the plugin's page) › **Search again**: the screens switched on
   appear. Rename them as people know them ("Living room TV"), hide those nobody should pick.
3. An **Apple TV** asks for a pairing, once: pick it in a cast form and click **Pair**, then type
   the code shown on the TV in the same window.

## First film

Right-click a video › **Plugins › Cast to a screen › Cast a video**, or open it and click **Cast
to…** next to the player. The form asks for the screen only (your own, starred one first, else
the first switched on); **More options** holds subtitles, start, audio track, conversion,
volume, address and port. **Run**: the film plays, its progress shows in Operations, and
cancelling the operation stops it.

## The remote

While something plays, **Casting** shows in the header of every page (nowhere else, and only
then). It opens the casts playing, each with its file, its screen and its state, a position bar
to drag, back and forward 30 s, play / pause, stop, and the volume when the screen reports it (an
Apple TV's volume stays on its own remote). The controls go through the cast that plays: an
Apple TV keeps one session per sender, so a second one would cut the film. They do not fill the
operations panel, except when one fails.

## When it does not work

| What you see                                                   | Likely cause                                                                                    | What to do                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| No screen found                                                | the relay is not running, or listens elsewhere than the cast network's gateway; screens are off | `docker logs dapple-relay`; check `--listen` matches the gateway; switch the screens on; or **Add** a screen by its locator       |
| "The screen never fetched the video from http://…:8690"        | the screen cannot reach that address: port not published, host firewall, wrong address          | publish 8690, open the firewall; check the address shown is the host's on the screens' network (else set it on the plugin's page) |
| "Not paired yet" on an Apple TV                                | the pairing was never done from this Canopy                                                     | **Pair** next to the screen                                                                                                       |
| The TV shows a cast screen, then nothing                       | a format the screen does not play, sent as stored                                               | use the engine image with ffmpeg, or set **Conversion › Always**                                                                  |
| Everything worked, then not after an update of the Docker host | the relay's network or subnet changed                                                           | check the cast network still has the gateway the relay listens on                                                                 |

dapple's own documentation, outside Canopy:
[README](https://github.com/AlexArtaud-Dev/dapple#readme). Devices: [devices](devices.md);
plugins: [plugins](plugins.md).
