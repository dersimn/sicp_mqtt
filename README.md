This is still very sketchy and should be considered a "proof of concept" rather than a fully working imlementation.

The goal was to build an MQTT bridge for a Digital Signage Display using the "LAN -> RS232" / SICP (Serial Interface Communication Protocol) interface according to [RS232C_commands_doc_LExx40UHS.pdf](https://cdn.iiyama.com/f/de454cd08ea1b06c77d4660c99bb779e_rs232c-commands-doc-lexx40uhs.pdf).  
I used an [iiyama ProLite LE4340UHS-B1](https://iiyama.com/de_de/produkte/prolite-le4340uhs-b1/), but there could be other manufacturers implementing similar protocolls (for e.g. [here](https://www.keren.nl/dynamic/media/1/documents/Drivers/The%20SICP%20Commands%20Document%20V1_99%2025%20May2017.pdf)).

## Usage

    docker run -d --name display_1 dersimn/sicp_mqtt \
        --mqtt-url mqtt://127.0.0.1 \
        --tv-address 192.168.10.231 \
        --tv-id 1 \
        --tv-name UpLeft

Print all options with:

    docker run --rm dersimn/sicp_mqtt --help

Topic structure will be as follows (depending on the parameter):

    <name> / set|status / <tv-address or tv-name> / <cmd>

e.g.:

    scip/status/UpLeft/power -> true
    scip/status/UpLeft/input -> HDMI2

Send commands using `+/set/#` topics according to the [mqtt-smarthome](https://github.com/mqtt-smarthome/mqtt-smarthome) topic-convention.

### Full example

Copy the contents from `example` folder and start with:

    docker-compose up -d

Then go to <http://localhost:8000>.

Edit the files according to your needs. Parameters from the `--help` output will be mapped to ENV variables according to the [yargs](https://yargs.js.org/docs/#api-envprefix) library. The config of a single display in Docker Compose could look like this:

      display_1:
        image: dersimn/sicp_mqtt
        restart: always
        environment:
          - SICP_TV_ID=1
          - SICP_TV_NAME=UpLeft
          - SICP_TV_ADDRESS=192.168.10.231
          - SICP_MQTT_URL=mqtt://127.0.0.1


## Development

Build own Docker Image with:

    docker build -t dersimn/sicp_mqtt .
    docker run --rm dersimn/sicp_mqtt --help

or test natively with:

  npm install
  node index.js --help