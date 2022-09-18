import fs from "node:fs/promises"
import { createWriteStream } from "node:fs"
import fetch from "node-fetch"

import { apiResponseValidator, File, ModListConfig, modlistValidator } from "./types"
import input from "@marzeq/awaitinput"
import chalk from "chalk"

export const api = (str: string, queryParams: Record<string, string>) => {
	if (str.startsWith("/"))
		str = str.slice(1)

	return `https://api.modrinth.com/v2/${str}${queryParams ? "?" + new URLSearchParams(queryParams).toString() : ""}`
}

export const error = (msg: string, prefix?: string) => console.error((prefix ?? "") + chalk.bold.red("✘ ") + chalk.red(msg))
export const warn = (msg: string, prefix?: string) => console.warn((prefix ?? "") + chalk.bold.yellow("! ") + chalk.yellow(msg))
export const info = (msg: string, prefix?: string) => console.info((prefix ?? "") + chalk.bold.blue("ℹ ") + chalk.blue(msg))
export const success = (msg: string, prefix?: string) => console.info((prefix ?? "") + chalk.bold.green("✓ ") + chalk.green(msg))

export const getLatestRelease = async (mod: string, modlist: ModListConfig): Promise<[string, File]> => {
	const res = await fetch(api(`/project/${mod}/version`, {
		game_versions: JSON.stringify([modlist.minecraftVersion]),
		loaders: JSON.stringify([modlist.loaderType])
	})),
		json = (await res.json()) as any
	
	if (!res.ok) {
		error(`Failed to fetch mod data for ${mod}!`)
		process.exit(1)
	}

	const parsed = apiResponseValidator.parse(json)
	
	const allowed = parsed.filter(v => v.version_type === "release" || modlist.unsafe.allowUnstable)

	if (allowed.length === 0) {
		error(`No files found for ${mod}!`)
		process.exit(1)
	}

	const latest = allowed[0]

	if (latest.version_type !== "release")
		warn(`Downloading an unstable version of ${mod}! It's not guaranteed to work, and may cause issues. If your game crashes, the mod is probably not compatible.`)

	return [mod, latest.files.filter(f => f.primary)[0] ?? latest.files[0]]
}

export const downloadFile = async (url: string, path: string) => {
	const res = await fetch(url)

	if (!res.ok) {
		error(`Failed to download file from ${url}!`)
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

        info(`Generated default config at ${configPath}`)
	}

	const rawModlist: ModListConfig = JSON.parse(await fs.readFile(configPath, "utf8"))

	const parseResult = modlistValidator.safeParse(rawModlist)

	if (!parseResult.success) {
		error(`Invalid config file!
${parseResult.error}`)
		process.exit(1)
	}

	return parseResult.data
}

export const warnForUnstable = async (modlist: ModListConfig) => {
    for (const [k] of Object.entries(modlist.unsafe).filter(([, v]) => v === true)) {
		if (k === "allowFailHash") {
			warn("You have enabled allowFailHash. This means that if a mod's hash doesn't match the one in the config, it will still be downloaded. This is not recommended, as the mod may be corrupted or malicious.")
		} else if (k === "allowUnstable") {
			warn("You have enabled allowUnstable. This means that unstable versions of mods will be downloaded. This is not recommended, as the mod may cause issues and may even crash your game.")
		}
	}
}
