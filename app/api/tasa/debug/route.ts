import { NextResponse } from 'next/server'
import https from 'https'

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'es-VE,es;q=0.9',
        'Connection': 'close',
      },
      timeout: 10000,
    }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', (e) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

export async function GET() {
  const resultado: Record<string, unknown> = {}

  // Test 1: dolarapi
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' })
    const body = await res.json()
    resultado.dolarapi = { status: res.status, body }
  } catch (e) {
    resultado.dolarapi = { error: String(e) }
  }

  // Test 2: bcv.org.ve via https nativo
  try {
    const { status, body } = await httpGet('https://www.bcv.org.ve/')
    const match = body.match(/id="dolar"[\s\S]*?<strong[^>]*>\s*([\d,]+)\s*<\/strong>/i)
    resultado.bcv_https = {
      status,
      match: match ? match[1] : null,
      body_len: body.length,
      has_dolar: body.includes('dolar'),
    }
  } catch (e) {
    resultado.bcv_https = { error: String(e) }
  }

  // Test 3: bcv via fetch normal
  try {
    const res = await fetch('https://www.bcv.org.ve/', {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
    })
    const body = await res.text()
    resultado.bcv_fetch = {
      status: res.status,
      body_len: body.length,
      has_dolar: body.includes('dolar'),
    }
  } catch (e) {
    resultado.bcv_fetch = { error: String(e) }
  }

  return NextResponse.json(resultado)
}
