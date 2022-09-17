#!/usr/bin/env node
import fs from "node:fs/promises"
import crypto from "node:crypto"
import commander from "commander"
import { cLogNoEnd, downloadFile, getLatestRelease, getModsFolderPath, getOrGenerateConfig, warnForUnstable } from "./util"

const main = async () => {
	const program = new commander.Command()
		.name("modrinth-updater")
		.version("1.0.1")
		.description("A tool to update your mods from Modrinth")
		.option("-m, --modfolder <path>", "The path to your mods folder")

	program.parse(process.argv)

	const modfolder = program.opts().modfolder || getModsFolderPath()

	if (!modfolder) {
		console.error("Could not automatically detect your mods folder. Please specify it manually with the --modfolder option.")
		process.exit(1)
	}

	const modlist = await getOrGenerateConfig(`${modfolder}/.modlist.json`).catch(() => {
		console.error("Could not parse config file!")
		process.exit(1)
	})

	await warnForUnstable(modlist)

	const oldModFolder = (await fs.readdir(modfolder)).filter(f => f.endsWith(".jar"))

	const temporaryFolder = `${modfolder}/.modrinth-updater-temporary`

	try {
		await fs.mkdir(temporaryFolder)
	} catch (e: any) {
		if (e.code !== "EEXIST") {
			console.error("Failed to create temporary folder!")
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
	
	console.log("Beginning download process... \n")

	for (const mod of modlist.mods) {
		cLogNoEnd(`${mod}: Fetching latest release... `)

		const [name, file] = await getLatestRelease(mod, modlist).catch(() => {
			console.error(`Failed to get latest release for ${mod}!`)
			process.exit(1)
		})

		cLogNoEnd("Fetched! ")

		const oldMod = oldModsAndHashes.find(([mod]) => mod === `${name}.jar`)

		if (file.hashes.sha256) {
			if (oldMod && oldMod[1].sha256 === file.hashes.sha256) {
				cLogNoEnd("Already up to date!\n")
				noRemove.add(oldMod[0])
				continue
			}
		}

		if (oldMod && oldMod[1].sha1 === file.hashes.sha1) {
			cLogNoEnd("Already up to date!\n")
			noRemove.add(oldMod[0])
			continue
		}

		cLogNoEnd("Downloading... ")

		await downloadFile(file.url, `${temporaryFolder}/${name}.jar`).catch(() => {
			cLogNoEnd("Failed to download.\n")
			process.exit(1)
		})

		cLogNoEnd("Downloaded! ")

		cLogNoEnd("Verifying hash... ")

		const localFile = await fs.readFile(`${temporaryFolder}/${name}.jar`)

		if (file.hashes.sha256) {
			const sha256 = crypto.createHash("sha256")

			sha256.update(localFile)

			if (sha256.digest("hex") !== file.hashes.sha256) {
				if (!modlist.unsafe.allowFailHash) {
					cLogNoEnd("Hash mismatch with sha256!\n")
					process.exit(1)
				} else {
					cLogNoEnd("Hash mismatch with sha256! Continuing anyway... ")
				}
			} else {
				cLogNoEnd("Hash verified with sha256! ")
			}
		} else {
			const sha1 = crypto.createHash("sha1")

			sha1.update(localFile)

			if (sha1.digest("hex") !== file.hashes.sha1) {
				if (!modlist.unsafe.allowFailHash) {
					cLogNoEnd("Hash mismatch with sha1!\n")
					process.exit(1)
				} else {
					cLogNoEnd("Hash mismatch with sha1! Continuing anyway... ")
				}
			} else {
				cLogNoEnd("Hash verified with sha1! ")
			}
		}

		console.log("Done!")
	}

	console.log("\nFinished downloading all mods!\n")

	console.log("Removing old mods...")

	for (const mod of oldModsAndHashes) {
		if (!noRemove.has(mod[0])) {
			await fs.unlink(`${modfolder}/${mod[0]}`)
		}
	}

	console.log("Moving new mods...")

	for (const mod of await fs.readdir(temporaryFolder)) {
		await fs.rename(`${temporaryFolder}/${mod}`, `${modfolder}/${mod}`)
	}

	console.log("Removing temporary folder...")

	await fs.rm(temporaryFolder, { recursive: true })

	console.log("\nDone updating!")
}

main().catch(console.error)