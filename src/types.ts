import { z } from "zod"

export const modlistValidator = z.object({
	minecraftVersion: z.string(),
	loaderType: z.enum(["fabric", "forge", "quilt", "liteloader"]),
	unsafe: z.object({
		allowFailHash: z.boolean(),
		allowUnstable: z.boolean(),
        allowProprietary: z.boolean()
	}),
	mods: z.array(z.string())
})

export type ModListConfig = z.infer<typeof modlistValidator>

export const fileValidator = z.object({
	url: z.string(),
	filename: z.string(),
	primary: z.boolean(),
	hashes: z.object({
		sha256: z.string().optional(),
		sha1: z.string()
	})
})

export type File = z.infer<typeof fileValidator>

export const apiResponseValidator = z.array(z.object({
    version_type: z.string(),
    id: z.string(),
    files: z.array(fileValidator)
}))