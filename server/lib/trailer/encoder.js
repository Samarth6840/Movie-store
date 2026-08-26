
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const encodeVideo = async (frames, { width, height, fps }) => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'trailer-'));
  const mp4Path = path.join(tmpDir, 'out.mp4');

  try {
    const frameStream = Readable.from(frames);

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-s', `${width}x${height}`,
        '-r', String(fps),
        '-i', 'pipe:0',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '32',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-movflags', '+faststart',
        '-f', 'mp4',
        mp4Path,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c.toString(); });
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg encode failed (code ${code}): ${stderr.slice(-300)}`));
      });
      ff.on('error', reject);
      ff.stdin.on('error', () => {});
      frameStream.pipe(ff.stdin);
    });

    return await readFile(mp4Path);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const mergeAudio = async (videoBuffer, audioBuffer) => {
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'merge-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const audioPath = path.join(tmpDir, 'audio.wav');
  const outPath = path.join(tmpDir, 'out.mp4');

  try {
    await Promise.all([
      writeFile(inPath, videoBuffer),
      writeFile(audioPath, audioBuffer),
    ]);

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', inPath,
        '-i', audioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-shortest',
        '-movflags', '+faststart',
        '-f', 'mp4',
        outPath,
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c.toString(); });
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg merge failed (code ${code}): ${stderr.slice(-300)}`));
      });
      ff.on('error', reject);
      ff.stdin.end();
    });

    return await readFile(outPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

export const encodeJpeg = (rawRgb, width, height) =>
  new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      '-s', `${width}x${height}`,
      '-i', 'pipe:0',
      '-frames:v', '1',
      '-q:v', '2',
      '-f', 'image2',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];

    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg jpeg exited with code ${code}`));
    });
    ffmpeg.on('error', reject);

    ffmpeg.stdin.on('error', () => {});
    ffmpeg.stdin.write(rawRgb);
    ffmpeg.stdin.end();
  });
