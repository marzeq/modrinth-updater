import fs from "node:fs/promises"
import { createWriteStream } from "node:fs"
import fetch from "node-fetch"

import { apiResponseValidator, File, ModListConfig, modlistValidator } from "./types"
import input from "@marzeq/awaitinput"

export const api = (str: string, queryParams: Record<string, string>) => {
	if (str.startsWith("/"))
		str = str.slice(1)

	return `https://api.modrinth.com/v2/${str}${queryParams ? "?" + new URLSearchParams(queryParams).toString() : ""}`
}

export const getLatestRelease = async (mod: string, modlist: ModListConfig): Promise<[string, File]> => {
	const res = await fetch(api(`/project/${mod}/version`, {
		game_versions: JSON.stringify([modlist.minecraftVersion]),
		loaders: JSON.stringify([modlist.loaderType])
	})),
		json = (await res.json()) as any
	
	if (!res.ok) {
		console.error(`Failed to fetch mod data for ${mod}!`)
		process.exit(1)
	}

	const parsed = apiResponseValidator.parse(json)
	
	const allowed = parsed.filter(v => v.version_type === "release" || modlist.unsafe.allowUnstable)

	if (allowed.length === 0) {
		console.error(`No files found for ${mod}!`)
		process.exit(1)
	}

	const latest = allowed[0]

	if (latest.version_type !== "release")
		console.warn(`Downloading an unstable version of ${mod}! It's not guaranteed to work, and may cause issues. If your game crashes, the mod is probably not compatible.`)

	return [mod, latest.files.filter(f => f.primary)[0] ?? latest.files[0]]
}

export const downloadFile = async (url: string, path: string) => {
	const res = await fetch(url)

	if (!res.ok) {
		console.error(`Failed to download file from ${url}!`)
		process.exit(1)
	}

	const fileStream = createWriteStream(path)

	await new Promise((resolve, reject) => {
		res.body.pipe(fileStream)
		res.body.on("error", reject)
		fileStream.on("finish", resolve)
	})
}

export const getModsFolderPath = () => {
    let dotMinecraftMods: string | null = null

    switch (process.platform) {
        case "win32":
            dotMinecraftMods = `C:\\Users\\${process.env.USERNAME}\\AppData\\Roaming\\.minecraft\\mods`
            break
        case "linux":
            dotMinecraftMods = `${process.env.HOME}/.minecraft/mods`
            break
        case "darwin":
            dotMinecraftMods = `${process.env.HOME}/Library/Application Support/.minecraft/mods`
            break
    }

    return dotMinecraftMods
}

export const getOrGenerateConfig = async (configPath: string): Promise<ModListConfig> => {
    try {
		await fs.access(configPath, fs.constants.F_OK)
	} catch (e) {
		await fs.writeFile(
			configPath,
`{
	"minecraftVersion": "1.19.2",
	"loaderType": "fabric",
	"unsafe": {
		"allowFailHash": false,
		"allowUnstable": false,
		"allowProprietary": true
	},
	"mods": []
}`
		)

        console.log(`Generated default config at ${configPath}`)
	}

	const rawModlist: ModListConfig = JSON.parse(await fs.readFile(configPath, "utf8"))

	const parseResult = modlistValidator.safeParse(rawModlist)

	if (!parseResult.success) {
		console.error(`Invalid config file!
${parseResult.error}`)
		process.exit(1)
	}

	return parseResult.data
}

const formatWarn = (text: string, opt: string, severe: boolean = false) => `!!! WARNING !!!
Unsafe mode enabled: ${opt}
${text}${severe ? "\nDO NOT ENABLE THIS OPTION IF YOU DO NOT KNOW WHAT YOU ARE DOING!!!\nTHE AUTHOR OF THIS PROGRAM IS NOT RESPONSIBLE FOR __ANY__ DAMAGE CAUSED BY THIS OPTION." : ""}
!!! WARNING !!!

Do you wish to continue?${severe ? " AGAIN, DO NOT CONTINUE IF YOU DON'T KNOW WHAT YOU'RE DOING" : ""} [y/N] `

export const warnForUnstable = async (modlist: ModListConfig) => {
    for (const [k, v] of Object.entries(modlist.unsafe)) {
		if (v === true) {
			if (k === "allowFailHash") {
				const inp = await input(formatWarn(`This will allow mods to be installed even if their hash does not match the one specified by the mod author.
This is a MAJOR security risk, as it allows infected mods to be installed without them being checked.`, k, true))
				if (!/^y/i.test(inp))
					process.exit(0)
				
				const inp2 = await input("This is a very bad idea, are you sure? [y/N] ")

				if (!/^y/i.test(inp2))
					process.exit(0)
				
				const inp3 = await input("Are you REALLY sure? [y/N] ")

				if (!/^y/i.test(inp3))
					process.exit(0)
				
				const inp4 = await input("Are you REALLY REALLY sure? THIS IS YOUR LAST CHANCE TO SAY NO [y/N] ")

				if (!/^y/i.test(inp4))
					process.exit(0)
			} else if (k === "allowUnstable") {
				const inp = await input(formatWarn(`This will allow mods to be installed even if they are marked as unstable.
These mods are not guaranteed to work, and may cause issues.
If your game crashes/has other issues with this option enabled, it's probably because of a mod marked as unstable.`, k))

				if (!/^y/i.test(inp))
					process.exit(0)
			}
		}
	}
}
