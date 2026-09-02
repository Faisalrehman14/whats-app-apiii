import { spawn } from "child_process";
import { randomBytes } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

export type MediaKind = "image" | "video" | "audio" | "document";

const LIMITS: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

export function mediaLimitBytes(kind: MediaKind) {
  return LIMITS[kind];
}

function extOf(name: string, mime: string) {
  const fromName = name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("heic") || mime.includes("heif")) return "heic";
  return "bin";
}

function runFfmpeg(args: string[]) {
  const bin = ffmpegPath;
  if (!bin) {
    return Promise.reject(new Error("ffmpeg is not available on this server"));
  }
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] }) as ReturnType<typeof spawn>;
    let err = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      err += String(chunk);
    });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Media conversion timed out"));
    }, 90_000);
    proc.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.slice(-400) || `ffmpeg exited ${code}`));
    });
  });
}

async function transcode(input: Buffer, inExt: string, outExt: string, args: string[]) {
  const id = randomBytes(8).toString("hex");
  const inPath = path.join(tmpdir(), `wa-in-${id}.${inExt}`);
  const outPath = path.join(tmpdir(), `wa-out-${id}.${outExt}`);
  await writeFile(inPath, input);
  try {
    await runFfmpeg(["-y", "-i", inPath, ...args, outPath]);
    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

function needsImageConvert(mime: string) {
  return !/image\/(jpeg|jpg|png|webp)/i.test(mime);
}

function needsVideoConvert(mime: string) {
  return !/video\/(mp4|3gpp)/i.test(mime);
}

function needsAudioConvert(mime: string) {
  if (/audio\/ogg/i.test(mime)) return false;
  if (/audio\/(aac|mp4|mpeg|amr)/i.test(mime)) return false;
  return true;
}

export async function prepareWhatsAppMedia(
  file: File,
  kind: MediaKind,
): Promise<{ blob: Blob; mime: string; filename: string }> {
  const mime = file.type || "application/octet-stream";
  const filename = file.name || `${kind}.bin`;
  if (kind === "document") {
    if (file.size > LIMITS.document) {
      throw new Error("Document is over WhatsApp’s 100 MB limit.");
    }
    return { blob: file, mime, filename };
  }

  const input = Buffer.from(await file.arrayBuffer());
  const inExt = extOf(filename, mime);

  if (kind === "image") {
    if (!needsImageConvert(mime) && file.size <= LIMITS.image) {
      return { blob: file, mime, filename };
    }
    const out = await transcode(input, inExt, "jpg", [
      "-vf",
      "scale='min(1920,iw)':-2",
      "-q:v",
      "4",
    ]);
    if (out.length > LIMITS.image) throw new Error("Photo is over WhatsApp’s 5 MB limit.");
    const bytes = new Uint8Array(out);
    return { blob: new Blob([bytes], { type: "image/jpeg" }), mime: "image/jpeg", filename: "photo.jpg" };
  }

  if (kind === "video") {
    if (!needsVideoConvert(mime) && file.size <= LIMITS.video) {
      return { blob: file, mime, filename };
    }
    const out = await transcode(input, inExt, "mp4", [
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "-vf",
      "scale='min(1280,iw)':-2",
    ]);
    if (out.length > LIMITS.video) throw new Error("Video is over WhatsApp’s 16 MB limit.");
    const bytes = new Uint8Array(out);
    return { blob: new Blob([bytes], { type: "video/mp4" }), mime: "video/mp4", filename: "video.mp4" };
  }

  if (!needsAudioConvert(mime) && file.size <= LIMITS.audio) {
    return { blob: file, mime, filename };
  }
  const out = await transcode(input, inExt, "ogg", ["-c:a", "libopus", "-b:a", "48k", "-vn"]);
  if (out.length > LIMITS.audio) throw new Error("Voice note is over WhatsApp’s 16 MB limit.");
  const bytes = new Uint8Array(out);
  return {
    blob: new Blob([bytes], { type: "audio/ogg" }),
    mime: "audio/ogg; codecs=opus",
    filename: "voice.ogg",
  };
}
