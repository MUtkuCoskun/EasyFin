// src/lib/firebase.ts
import fs from 'fs'
import path from 'path'
import admin from 'firebase-admin'
import type { Bucket, File } from '@google-cloud/storage'

let inited = false

function ensureInit() {
  if (inited) return
  const bucketName = process.env.FIREBASE_BUCKET
  if (!bucketName) throw new Error('FIREBASE_BUCKET missing in env')

  if (!admin.apps.length) {
    // Eğer GOOGLE_APPLICATION_CREDENTIALS set ise default creds kullanır
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ storageBucket: bucketName })
    } else {
      const svcPath = path.join(process.cwd(), 'serviceAccountKey.json')
      const svc = JSON.parse(fs.readFileSync(svcPath, 'utf8'))
      admin.initializeApp({ credential: admin.credential.cert(svc), storageBucket: bucketName })
    }
  }
  inited = true
}

export function getBucket(): Bucket {
  ensureInit()
  return admin.storage().bucket() // tip: Bucket
}

export async function readText(file: File): Promise<string> {
  const [buf] = await file.download()
  return buf.toString('utf8')
}

export async function readJson<T = any>(file: File): Promise<T> {
  return JSON.parse(await readText(file))
}
