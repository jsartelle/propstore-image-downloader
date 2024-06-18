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
  failedCount = 0

/* Create the cache folder if it doesn't exist */
const CACHE_PATH = `cache/${LOT_ID}`
try {
  await access(CACHE_PATH)
} catch {
  mkdir(CACHE_PATH)
}

/* Get the links to all the lot pages */
try {
  /* Check for cached lot URLs */
  lotURLs = JSON.parse(
    await readFile(`${CACHE_PATH}/lotURLs.json`, { encoding: 'utf-8' })
  )
  console.log('Using cached lot URLs')
} catch {
  console.log('Getting lot URLs...')
  for (let index = 1; index <= PAGE_COUNT; index++) {
    const document = await getDocument(
      `https://propstoreauction.com/auctions/catalog/id/${LOT_ID}?page=${index}`
    )

    /* Find all the lot links */
    /** @type {NodeListOf<HTMLAnchorElement>} */
    const links = document.querySelectorAll('a.yaaa')
    const urls = Array.from(links).map((link) => link.href)
    lotURLs.push(...urls)
  }

  /* Save them to the cache file */
  await writeFile(`${CACHE_PATH}/lotURLs.json`, JSON.stringify(lotURLs), {
    encoding: 'utf-8',
  })
}

/* Get the image links from each lot page */
try {
  /* Check for cached image URLs */
  imageURLs = JSON.parse(
    await readFile(`${CACHE_PATH}/imageURLs.json`, { encoding: 'utf-8' })
  )
  console.log('Using cached image URLs')
} catch {
  console.log('Getting image URLs...')
  for (const url of lotURLs) {
    /* Get the contents of the lot page */
    const document = await getDocument(url)

    /* Get the lot name */
    const lotName = document.querySelector('.lot-name')?.textContent ?? url

    /* Get all image URLs from the carousel */
    /** @type {NodeListOf<HTMLDivElement>} */
    const imageElements = document.body.querySelectorAll(
      '#modal-product-gallery .carousel-item'
    )
    const urls = Array.from(imageElements).map((el) => {
      return /url\('?(.+)'?\)/.exec(el.style.backgroundImage)?.[1] ?? ''
    })
    imageURLs[lotName] = urls
  }

  /* Save them to the cache file */
  await writeFile(`${CACHE_PATH}/imageURLs.json`, JSON.stringify(imageURLs), {
    encoding: 'utf-8',
  })
}

console.log('Starting download...')

for (const [lotName, urls] of Object.entries(imageURLs)) {
  /* Remove unsafe file name characters */
  const lotNameSafe = lotName.replace(/[\\/:"*?<>|]+/g, '-')
  const folderPath = `images/${LOT_ID}/${lotNameSafe}`

  /* Make a folder for the lot if it doesn't exist */
  try {
    await access(folderPath)
  } catch {
    mkdir(folderPath, { recursive: true })
  }

  urls.forEach(async (url, index) => {
    /* Add #- to the filename */
    const filename = `${index + 1}-${new URL(url).pathname.slice(1)}`

    // Check if the image is already downloaded
    const imagePath = `${folderPath}/${filename}`
    try {
      await access(imagePath)
    } catch {
      downloadPromises.push(saveImage(url, imagePath))
    }
  })
}

/* This lets the images download simultaneously */
Promise.all(downloadPromises).then(() => {
  /* Log when all the images have either succeeded or failed */
  console.log(`Downloaded ${downloadCount} images, ${failedCount} failed`)
})

/** @param {string} url */
async function getDocument(url) {
  /* Get the raw page data */
  const page = await fetch(url)
  /* Parse it as HTML */
  const html = new JSDOM(await page.text(), { url })
  return html.window.document
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
    console.error(`Failed to download ${path}`)
    failedCount++
  }
}

export { }

