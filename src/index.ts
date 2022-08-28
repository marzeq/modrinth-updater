import fs from "node:fs/promises"
import crypto from "node:crypto"

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

if (os === "unknown" && process.argv.length < 3) {
	console.error("Unknown OS and no mod folder path specified")
	process.exit(1)
}

dotMinecraftMods = process.argv[2] ?? dotMinecraftMods

const configPath = `${dotMinecraftMods}/.modlist.json`

try {
	await fs.access(configPath, fs.constants.F_OK)
} catch (e) {
	await fs.writeFile(
		configPath,
		`{
    "minecraftVersion": "1.19.2",
    "mods": []
}`
	)
}

const modlist: {
	minecraftVersion: string
	mods: string[]
} = JSON.parse(await fs.readFile(configPath, "utf8"))

type File = {
	url: string
	filename: string
	primary: boolean
	hashes: {
		sha512?: string
		sha1?: string
	}
}

const latestModIds = (await Promise.all(
	modlist.mods.map(async mod => {
		const res = await fetch(`https://api.modrinth.com/v2/project/${mod}/version?game_versions=["${modlist.minecraftVersion}"]`),
			json: {
				version_type: string
				id: string
				files: File[]
			}[] = await res.json()

		const fullRelease = json.filter(v => v.version_type === "release")[0]

		if (!fullRelease) return [mod, null]

		return [mod, fullRelease.files]
	})
)) as [string, File[] | null][]

const notFoundMods = latestModIds.filter(([, files]) => files === null) as [string, null][]

if (notFoundMods.length > 0) {
	console.error(`Some mods don't have a FULL release for this version of Minecraft:
${notFoundMods.map(([mod]) => mod).join("\n")}`)

	process.exit(1)
}

const oldMods = (await fs.readdir(dotMinecraftMods)).filter(f => f.endsWith(".jar")),
	skipOldMods: string[] = []

// make temporary directory for downloading mods
const tempDir = `${dotMinecraftMods}/__temp_downloads__`

await fs.mkdir(tempDir)

// download the latest versions of the mods

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

	if (downloadHash !== hash) {
		console.error(`Downloaded file ${latest.filename} has failed checksum verification with algorithm ${hashAlgo}`)
		process.exit(1)
	}

	await fs.writeFile(`${tempDir}/${latest.filename}`, buffer)
}

for (const mod of oldMods.filter(f => !skipOldMods.includes(f))) await fs.unlink(`${dotMinecraftMods}/${mod}`)

for (const mod of await fs.readdir(tempDir)) await fs.rename(`${tempDir}/${mod}`, `${dotMinecraftMods}/${mod}`)

await fs.rmdir(tempDir)

console.log("Done updating all your mods!")
