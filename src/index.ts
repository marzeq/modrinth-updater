#!/usr/bin/env node
import fs from "node:fs/promises"
import crypto from "node:crypto"
import commander from "commander"
import { downloadFile, error, getLatestRelease, getModsFolderPath, getOrGenerateConfig, info, success, warn, warnForUnstable } from "./util"

const main = async () => {
	const program = new commander.Command()
		.name("modrinth-updater")
		.version("1.0.2")
		.description("A tool to update your mods from Modrinth")
		.option("-m, --modfolder <path>", "The path to your mods folder")

	program.parse(process.argv)

	const modfolder = program.opts().modfolder || getModsFolderPath()

	if (!modfolder) {
		error("Could not automatically detect your mods folder. Please specify it manually with the --modfolder option.")
		process.exit(1)
	}

	const modlist = await getOrGenerateConfig(`${modfolder}/.modlist.json`).catch(() => {
		error("Could not parse config file!")
		process.exit(1)
	})

	await warnForUnstable(modlist)

	const oldModFolder = (await fs.readdir(modfolder)).filter(f => f.endsWith(".jar"))

	const temporaryFolder = `${modfolder}/.modrinth-updater-temporary`

	try {
		await fs.mkdir(temporaryFolder)
	} catch (e: any) {
		if (e.code !== "EEXIST") {
			error("Failed to create temporary folder!")
			process.exit(1)
		}
	}

	const oldModsAndHashes = await Promise.all(oldModFolder.map(async mod => {
		const sha256 = crypto.createHash("sha256"),
			sha1 = crypto.createHash("sha1")

		const file = await fs.readFile(`${modfolder}/${mod}`)

		sha256.update(file)
		sha1.update(file)

		return [mod, {
			sha256: sha256.digest("hex"),
			sha1: sha1.digest("hex")
		}] as const
	})),
		noRemove = new Set<string>()
	
	info("Beginning download process... \n")

	const downloadProcess = async (mod: string) => {
		const [name, file] = await getLatestRelease(mod, modlist).catch(() => {
			error(`Failed to get latest release for ${mod}!`)
			process.exit(1)
		})

		const oldMod = oldModsAndHashes.find(([mod]) => mod === `${name}.jar`)

		if (file.hashes.sha256) {
			if (oldMod && oldMod[1].sha256 === file.hashes.sha256) {
				info(`${mod} is already up to date! (sha256)`)
				noRemove.add(oldMod[0])
				return
			}
		}

		if (oldMod && oldMod[1].sha1 === file.hashes.sha1) {
			noRemove.add(oldMod[0])
			info(`${mod} is already up to date! (sha1)`)
			return
		}

		await downloadFile(file.url, `${temporaryFolder}/${name}.jar`).catch(() => {
			process.exit(1)
		})

		const localFile = await fs.readFile(`${temporaryFolder}/${name}.jar`)

		const checkHash = (hash: string, type: "sha256" | "sha1") => {
			const hashFunc = crypto.createHash(type)

			hashFunc.update(localFile)

			if (hashFunc.digest("hex") !== hash) {
				if (modlist.unsafe.allowFailHash) {
					error(`Hash mismatch for ${mod}! (${type})`)
					process.exit(1)
				} else {
					warn(`Hash mismatch for ${mod}! (${type}). Will continue anyway. Be careful!`)
				}
			}
		}

		file.hashes.sha256 ? checkHash(file.hashes.sha256, "sha256") : checkHash(file.hashes.sha1, "sha1")

		success(`Downloaded ${mod}!`)
	}

	await Promise.all(modlist.mods.map(downloadProcess))

	success("Finished downloading all mods!\n", "\n")

	info("Removing old mods...")

	for (const mod of oldModsAndHashes) {
		if (!noRemove.has(mod[0])) {
			await fs.unlink(`${modfolder}/${mod[0]}`)
		}
	}

	success("Removed old mods!\n")

	info("Moving new mods...")

	for (const mod of await fs.readdir(temporaryFolder)) {
		await fs.rename(`${temporaryFolder}/${mod}`, `${modfolder}/${mod}`)
	}

	success("Moved new mods!\n")

	info("Cleaning up...")

	await fs.rm(temporaryFolder, { recursive: true })

	success("Cleaned up!\n")

	success("Finished updating mods!")
}

main().catch(error)