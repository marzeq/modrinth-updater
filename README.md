# modrinth-updater

A simple CLI tool to update your mods from a config file using the modrinth API

## Setup


Create a .modlist.json file in your mods folder that looks something like this:

```json
{
    "minecraftVersion": "(the minecraft version you play on)",
    "loaderType": "(fabric, forge, quilt or liteloader)",
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

## Installation

You can run this tool directly with npx:

```
$ npx modrinth-updater
```

You can also install the package globally and run it like this:

```
$ npm install -g modrinth-updater
$ modrinth-updater
```

## Help

```
Usage: modrinth-updater [options]

A tool to update your mods from Modrinth

Options:
  -V, --version           output the version number
  -m, --modfolder <path>  The path to your mods folder
  -h, --help              display help for command
```


## Disclaimer

Make sure you have a backup of your mods folder before running this tool. I am not responsible for any damage caused by this tool.

I will not help you if you can't use the command line. If you don't know how to use the command line, you probably shouldn't be using this tool.
