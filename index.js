import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { JSDOM } from 'jsdom'

/** @type {number} */
const LOT_ID = 412
/** @type {number} */
const PAGE_COUNT = 14

/** @type {string[]} */
let lotURLs = []
/** @type {Record<string, string[]>} */
let imageURLs = {}

/** @type {Promise<void>[]} */
const downloadPromises = []

let downloadCount = 0,
  failedCount = 0,
  existingCount = 0

/* Create the cache folder if it doesn't exist */
const cachePath = await makeFolder(`cache/${LOT_ID}`)

/* Get the links to all the lot pages */
try {
  /* Check for cached lot URLs */
  lotURLs = JSON.parse(
    await readFile(`${cachePath}/lotURLs.json`, { encoding: 'utf-8' })
  )
  console.log('Using cached lot URLs')
} catch {
  console.log('Getting lot URLs...')
  const indexPageFolder = await makeFolder(`cache/${LOT_ID}/indexPages`)
  for (let index = 1; index <= PAGE_COUNT; index++) {
    const url = `https://propstoreauction.com/auctions/catalog/id/${LOT_ID}?page=${index}`
    const indexPagePath = `${indexPageFolder}/${index}.json`
    const document = await getAndCacheDocument(url, indexPagePath)

    /* Find all the lot links */
    /** @type {NodeListOf<HTMLAnchorElement>} */
    const links = document.querySelectorAll('a.yaaa')
    const urls = Array.from(links).map((link) => link.href)
    lotURLs.push(...urls)
  }

  /* Save them to the cache file */
  await writeFile(`${cachePath}/lotURLs.json`, JSON.stringify(lotURLs), {
    encoding: 'utf-8',
  })
}

/* Get the image links from each lot page */
try {
  /* Check for cached image URLs */
  imageURLs = JSON.parse(
    await readFile(`${cachePath}/imageURLs.json`, { encoding: 'utf-8' })
  )
  console.log('Using cached image URLs')
} catch {
  console.log('Getting image URLs...')
  const lotPageFolder = await makeFolder(`cache/${LOT_ID}/lotPages`)
  for (const lotPageURL of lotURLs) {
    /* Get the contents of the lot page */
    const lotId = /(?<=lot\/)\d+/.exec(lotPageURL)
    const lotPagePath = `${lotPageFolder}/${lotId}.json`
    const document = await getAndCacheDocument(lotPageURL, lotPagePath)

    /* Get the lot name */
    const lotName =
      document.querySelector('.lot-name, .product__title')?.textContent ??
      lotPageURL

    /* Get all image URLs from the carousel */
    /** @type {NodeListOf<HTMLDivElement>} */
    const imageElements = document.body.querySelectorAll(
      '.product__gallery-array-item'
    )
    const urls = Array.from(imageElements)
      .map((el) => el.dataset.url || '')
      .filter(Boolean)
    console.log(
      `${lotName} - got ${urls.length} URLs from ${imageElements.length} images`
    )
    imageURLs[lotName] = urls
  }

  /* Save them to the cache file */
  await writeFile(`${cachePath}/imageURLs.json`, JSON.stringify(imageURLs), {
    encoding: 'utf-8',
  })
}

console.log('Starting download...')

for (const [lotName, urls] of Object.entries(imageURLs)) {
  /* Remove unsafe file name characters */
  const lotNameSafe = lotName.replace(/[\\/:"*?<>|]+/g, '-')
  const folderPath = await makeFolder(`images/${LOT_ID}/${lotNameSafe}`)

  await Promise.all(
    urls.map(async (url, index) => {
      /* Add #- to the filename */
      const filename = `${index + 1}-${new URL(url).pathname.slice(1)}`

      // Check if the image is already downloaded
      const imagePath = `${folderPath}/${filename}`
      try {
        await access(imagePath)
        existingCount++
      } catch {
        downloadPromises.push(saveImage(url, imagePath))
      }
    })
  )
}

/* This lets the images download simultaneously */
Promise.all(downloadPromises).then(() => {
  /* Log when all the images have either succeeded or failed */
  console.log(
    `Downloaded ${downloadCount} images, ${failedCount} failed, ${existingCount} already saved`
  )
})

/**
 * Check if the folder exists and create it if needed
 * @param {string} cachePath
 */
async function makeFolder(cachePath) {
  try {
    await access(cachePath)
  } catch {
    await mkdir(cachePath, { recursive: true })
  }
  return cachePath
}

/**
 * Get the document from the cache if available, otherwise fetch it
 * @param {string} url
 * @param {string} cachePath
 */
async function getAndCacheDocument(url, cachePath) {
  /** @type {Document} */
  let document

  try {
    /* check for cached page - could be used to get around bot detection by saving HTML manually from browser */
    const docString = await readFile(cachePath, {
      encoding: 'utf-8',
    })
    const { url, html } = JSON.parse(docString)
    const dom = new JSDOM(html, { url })
    document = dom.window.document
    console.log(`Using cached page ${url}`)
  } catch {
    /* download and cache page */
    console.log(`Fetching page ${url}`)
    document = await fetchDocument(url)

    await writeFile(
      cachePath,
      JSON.stringify(
        {
          url,
          html: document.documentElement.outerHTML,
        },
        null,
        '\t'
      )
    )
  }

  return document
}

/**
 * Fetch the page and parse it as a document
 * @param {string} url
 */
async function fetchDocument(url) {
  /* Get the raw page data */
  const page = await fetch(url, {
    headers: {
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      priority: 'u=0, i',
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      cookie:
        'PHPSESSID=0vpt1s0ceel35aanefj0j0usi1; st_SALEREG=412; HttpReferer=https%3A%2F%2Fpropstoreauction.com%2Fauctions%2Fcatalog%2Fid%2F412%3Fpage%3D2; __cf_bm=tvbsipslXpELYq6jNQWtUUX_hqDBVyAsINu7bP5OR9k-1718757031-1.0.1.1-5BUUgH1T41LrzMDCPWnoVaKYVn1nMt0cXvVDGkBubH19783_Y1PIkn0fbk_sHloN2SmJGsptYWC.aLvxlWMUmg; cf_clearance=.4NV0Mjkd76TFOo38IhIqXS9edX4nvOzqm3B_cKapII-1718757273-1.0.1.1-4e0C4lDkyMMG3TgocWFMDiI08wyy.q5AxlLTV5EF6JRrHSi_fghAVqbb.TNzqmtQwERJmO1t2OqMpmK0BVjJ5w',
      Referer: 'https://propstoreauction.com/auctions/catalog/id/412?page=2',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
    body: null,
    method: 'GET',
  })
  /* Parse it as HTML */
  const dom = new JSDOM(await page.text(), {
    url,
    // pretendToBeVisual: true,
    // runScripts: 'dangerously',
    // resources: 'usable',
  })
  return dom.window.document
}

/**
 * @param {string} url
 * @param {string} path
 */
async function saveImage(url, path) {
  try {
    /* Get the raw image data */
    const imageData = await fetch(url)
    /* Turn it into a buffer and save it */
    const imageBuffer = await imageData.arrayBuffer()
    await writeFile(path, Buffer.from(imageBuffer))
    downloadCount++
  } catch (err) {
    console.error(`Failed to download ${path}`, err)
    failedCount++
  }
}

export {}
