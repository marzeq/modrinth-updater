#!/usr/bin/env node
import fs from "node:fs/promises"
import crypto from "node:crypto"
import fetch from "node-fetch"
import { input } from "@marzeq/awaitinput"
import { z } from "zod"

if (process.argv.find(v => "--help" === v || "-h" === v)) {
	console.log(`Usage: <command> [path to mods folder if it's somewhere else (optional)]`)
	process.exit(0)
} else if (process.argv.find(v => "--version" === v || "-v" === v)) {
	console.log(`Version: 0.0.13`)
	process.exit(0)
}

let os: "windows" | "linux" | "macos" | "unknown" = "unknown"

switch (process.platform) {
	case "win32":
		os = "windows"
		break
	case "linux":
		os = "linux"
		break
	case "darwin":
		os = "macos"
		break
}

let dotMinecraftMods: string = ""

switch (os) {
	case "windows":
		dotMinecraftMods = `C:\\Users\\${process.env.USERNAME}\\AppData\\Roaming\\.minecraft\\mods`
		break
	case "linux":
		dotMinecraftMods = `${process.env.HOME}/.minecraft/mods`
		break
	case "macos":
		dotMinecraftMods = `${process.env.HOME}/Library/Application Support/.minecraft/mods`
		break
}

const nonOptionArgs = process.argv.filter(v => !v.startsWith("-"))

if (os === "unknown" && nonOptionArgs.length < 3) {
	console.error("Unknown OS and no mod folder path specified! Please specify a mod folder path.")
	process.exit(1)
}

dotMinecraftMods = nonOptionArgs[2] ?? dotMinecraftMods

const configPath = `${dotMinecraftMods}/.modlist.json`

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
		"allowUnstable": false
	},
    "mods": []
}`
	)
}

const modlistValidator = z.object({
	minecraftVersion: z.string(),
	loaderType: z.enum(["fabric", "forge", "quilt", "liteloader"]),
	unsafe: z.object({
		allowFailHash: z.boolean().default(false),
		allowUnstable: z.boolean().default(false)
	}).default({ allowFailHash: false, allowUnstable: false }),
	mods: z.array(z.string())
})

type ModListConfig = z.infer<typeof modlistValidator>

const rawModlist: ModListConfig = JSON.parse(await fs.readFile(configPath, "utf8"))

const parseResult = modlistValidator.safeParse(rawModlist)

if (!parseResult.success) {
	console.error("Invalid config file!")
	process.exit(1)
}

const modlist = parseResult.data

for (const [k, v] of Object.entries(modlist.unsafe)) {
	if (v === true) {
		if (k === "allowFailHash") {
			const inp = await input(`!!! WARNING !!!
Unsafe mode enabled: allowFailHash!
This will allow mods to be installed even if their hash does not match the one specified by the mod author.
This is a MAJOR security risk, as it allows infected mods to be installed without them being checked.
DO NOT ENABLE THIS OPTION IF YOU DO NOT KNOW WHAT YOU ARE DOING!!!
THE AUTHOR OF THIS PROGRAM IS NOT RESPONSIBLE FOR __ANY__ DAMAGE CAUSED BY THIS OPTION.
!!! WARNING !!!

Do you wish to continue? AGAIN, DO NOT CONTINUE IF YOU DON'T KNOW WHAT YOU'RE DOING [y/N] `)
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
			
			console.log("Ok, you asked for it.")
		} else if (k === "allowUnstable") {
			const inp = await input(`!!! WARNING !!!
Unsafe mode enabled: allowUnstable!
This will allow mods to be installed even if they are marked as unstable.
These mods are not guaranteed to work, and may cause issues.
If your game crashes/has other issues with this option enabled, it's probably because of a beta mod.
!!! WARNING !!!

Do you wish to continue? [y/N] `)

			if (!/^y/i.test(inp))
				process.exit(0)
			
			console.log("Ok, you asked for it.")
		}
	}
}

const typeValidator = z.object({
	url: z.string(),
	filename: z.string(),
	primary: z.boolean(),
	hashes: z.object({
		sha512: z.string().optional(),
		sha1: z.string().optional()
	})
})

type File = z.infer<typeof typeValidator>

const getLatestFiles = async (mod: string, mcVersion: string = modlist.minecraftVersion): Promise<[string, File[]]> => {
	const apiResponseValidator = z.array(z.object({
		version_type: z.string(),
		id: z.string(),
		files: z.array(typeValidator)
	}))

	const res = await fetch(`https://api.modrinth.com/v2/project/${mod}/version?game_versions=["${mcVersion}"]&loaders=["${modlist.loaderType}"]`),
		json = (await res.json()) as any
	
	if (!res.ok) {
		console.error(`Failed to fetch mod data for ${mod}!`)
		process.exit(1)
	}

	const parsed = apiResponseValidator.parse(json)
	
	const fullReleaseCount = parsed.filter(v => v.version_type === "release").length

	if (fullReleaseCount === 0 && !modlist.unsafe.allowUnstable) {
		if (mcVersion.split(".").length > 2) {
			const newVersion = mcVersion.split(".")[0] + "." + mcVersion.split(".")[1]
			console.warn(`!!! No release of ${mod} found for Minecraft version ${mcVersion}, falling back to ${newVersion}. The mod is not guaranteed to work with ${mcVersion}. If your game crashes, the mod is probably not compatible.`)
			const inp = await input("Do you wish to continue? [y/N] ")

			if (!/^y/i.test(inp))
				process.exit(0)

			return await getLatestFiles(mod, newVersion)
		}
		console.error(`The mod ${mod} does not have a release for Minecraft version ${mcVersion}!
It may have a beta/alpha release, but you have disabled beta/alpha releases in the config file. To enable beta/alpha releases, set "unsafe.allowBeta" to true in the config file.`)
		process.exit(1)
	}
	
	const allowedRelease = parsed.filter(v => v.version_type === "release" || modlist.unsafe.allowUnstable)[0]

	if (fullReleaseCount === 0 && modlist.unsafe.allowUnstable)
		console.warn(`Downloading an unstable version of ${mod}! It's not guaranteed to work, and may cause issues. If your game crashes, the mod is probably not compatible.`)

	console.log(`Found a release for ${mod} (ID: ${allowedRelease.id})`)

	return [mod, allowedRelease.files]
}

const latestModIds = await Promise.all(
	modlist.mods.map(async mod => getLatestFiles(mod))
).catch(() => {
	console.error("Failed to fetch mod data!")
	process.exit(1)
})

const oldMods = (await fs.readdir(dotMinecraftMods)).filter(f => f.endsWith(".jar")),
	skipOldMods: string[] = []

const tempDir = `${dotMinecraftMods}/__temp_downloads__`

await fs.mkdir(tempDir)

for (const [mod, files] of latestModIds as [string, File[]][]) {
	const latest = files.filter(f => f.primary)[0] ?? files[0]

	if (!latest) {
		console.error(`No files found for ${mod}!`)
		process.exit(1)
	}

	const bestHash: [string, "sha512" | "sha1"] | null = latest.hashes.sha512
		? [latest.hashes.sha512, "sha512"]
		: latest.hashes.sha1
		? [latest.hashes.sha1, "sha1"]
		: null

	if (!bestHash) {
		console.error(`No checksum hash found for ${mod}. Due to security reasons, it will not be downloaded.`)
		process.exit(1)
	}

	const [hash, hashAlgo] = bestHash

	const filePath = `${dotMinecraftMods}/${latest.filename}`

	if (oldMods.includes(latest.filename)) {
		skipOldMods.push(latest.filename)
		const existingHash = crypto
			.createHash(hashAlgo)
			.update(await fs.readFile(filePath))
			.digest("hex")

		if (existingHash === hash) {
			console.log(`${latest.filename} is up to date, skipping...`)
			continue
		}
	}

	console.log(`Downloading ${latest.filename}`)

	const res = await fetch(latest.url).catch(() => null)

	if (!res || !res.body) {
		console.error(`Could not download ${latest.filename}`)
		process.exit(1)
	}

	const array = await res.arrayBuffer(),
		buffer = Buffer.from(array)

	const downloadHash = crypto.createHash(hashAlgo).update(buffer).digest("hex")

	if (downloadHash !== hash && !modlist.unsafe.allowFailHash) {
		console.error(`Downloaded file ${latest.filename} has failed checksum verification with algorithm ${hashAlgo}
Expected hash: ${hash}
Got: ${downloadHash}
To disable this check, set "unsafe.allowFailHash" to true in the config file.`)
		process.exit(1)
	} else if (modlist.unsafe.allowFailHash) {
		console.warn(`Downloaded file ${latest.filename} has failed checksum verification with algorithm ${hashAlgo}
Expected hash: ${hash}
Got: ${downloadHash}
This mod may be corrupted or be infected with malware. Please check the file manually in a safe enviorment before running the game. If in doubt, contact the mod author or remove the mod.`)

	await fs.writeFile(`${tempDir}/${latest.filename}`, buffer)
	}
}

const inp = await input("The old mods are about to be deleted. Do you wish to continue? [Y/n] ")

if (/^n/i.test(inp)) {
	console.log("Aborting... Your old mods are still in the mods folder.")
	await fs.rmdir(tempDir)
	process.exit(0)
}

for (const mod of oldMods.filter(m => !skipOldMods.includes(m))) await fs.unlink(`${dotMinecraftMods}/${mod}`)

for (const mod of await fs.readdir(tempDir)) await fs.rename(`${tempDir}/${mod}`, `${dotMinecraftMods}/${mod}`)

await fs.rmdir(tempDir)

console.log("Done updating all your mods!")
