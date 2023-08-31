import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { JSDOM } from 'jsdom'

/** @type {string[]} */
let lotURLs = []
/** @type {Record<string, string[]>} */
let imageURLs = {}

let downloadCount = 0,
  failedCount = 0

/* Create the cache folder if it doesn't exist */
try {
  await access('cache')
} catch {
  mkdir('cache')
}

/* Get the links to all the lot pages */
try {
  lotURLs = JSON.parse(
    await readFile('cache/lotURLs.json', { encoding: 'utf-8' })
  )
  console.log('Using cached lot URLs')
} catch {
  for (let index = 1; index <= 12; index++) {
    const document = await getDocument(
      `https://propstoreauction.com/auctions/catalog/id/377?page=${index}`
    )

    /** @type {NodeListOf<HTMLAnchorElement>} */
    const links = document.querySelectorAll('a.auc-lot-link')
    const urls = Array.from(links).map((link) => link.href)
    lotURLs.push(...urls)
  }

  await writeFile('cache/lotURLs.json', JSON.stringify(lotURLs), {
    encoding: 'utf-8',
  })
}

/* Get the image links from each lot page */
try {
  imageURLs = JSON.parse(
    await readFile('cache/imageURLs.json', { encoding: 'utf-8' })
  )
  console.log('Using cached image URLs')
} catch {
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

  await writeFile('cache/imageURLs.json', JSON.stringify(imageURLs), {
    encoding: 'utf-8',
  })
}

const downloadPromises = []

console.log('Starting download...')

for (const [lotName, urls] of Object.entries(imageURLs)) {
  const lotNameSafe = lotName.replace(/[\\/:"*?<>|]+/g, '-')
  const folderPath = `images/${lotNameSafe}`

  /* Make a folder for the lot if it doesn't exist */
  try {
    await access(folderPath)
  } catch {
    mkdir(folderPath, { recursive: true })
  }

  urls.forEach(async (url, index) => {
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

Promise.all(downloadPromises).then(() => {
  console.log(`Downloaded ${downloadCount} images, ${failedCount} failed`)
})

/** @param {string} url */
async function getDocument(url) {
  const page = await fetch(url)
  const html = new JSDOM(await page.text(), { url })
  return html.window.document
}

async function saveImage(url, path) {
  try {
    const imageData = await fetch(url)
    const imageBuffer = await imageData.arrayBuffer()
    await writeFile(path, Buffer.from(imageBuffer))
    downloadCount++
  } catch (err) {
    console.error(`Failed to download ${path}`)
    failedCount++
  }
}

export { }

