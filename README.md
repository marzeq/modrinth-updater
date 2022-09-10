# modrinth-updater

A simple CLI tool to update your mods from a config file using the modrinth API

**THIS IS BETA SOFTWARE!!! MAKE SURE TO BACKUP YOUR MODS FOLDER BEFORE YOU USE THIS SOFTWARE!!! I AM NOT RESPONSIBLE FOR ANY DAMAGE CAUSED BY THIS SOFTWARE!!!**

## Setup


Create a .modlist.json file in your mods folder that looks something like this:

```json
{
    "minecraftVersion": "(the minecraft version you play on)",
    "loaderType": "(fabric, forge or quilt)",
    "unsafe": {
        "allowUnstable": "(true or false)",
        "allowFailHash": "(true or false)"
    },
    "mods": [
        "(last part of the project's url on modrinth e.g. fabric-api for the Fabric API)",
        "(put more mods on a new line and make sure there's a comma at the end of the previous line)",
        "(and so on...)",
        "(last one)"
    ]
}
```

For example, this is my config file:

```json
{
    "minecraftVersion": "1.19.2",
    "loaderType": "fabric",
    "unsafe": {
        "allowUnstable": false,
        "allowFailHash": false
    },
    "mods": [
        "fabric-api",
        "sodium",
        "betterf3",
        "capes",
        "fabric-language-kotlin",
        "iris",
        "lambdynamiclights",
        "lithium",
        "logical-zoom",
        "modmenu",
        "no-chat-reports",
        "starlight"
    ]
}
```

## Usage

```
$ npx modrinth-updater [path to mods folder if it's somewhere else (optional)]
```

You can also install the package globally and run it like this:

```
$ npm install -g modrinth-updater
$ modrinth-updater [path to mods folder if it's somewhere else (optional)]
```