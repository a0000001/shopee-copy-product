(function () {
  async function downloadMediaAsFile(url, filename, mimeType, skipPng = false) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchBlob', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response || !response.ok) {
          reject(new Error(response?.error || '下載失敗'))
          return
        }
        try {
          const base64 = response.data.base64
          const type = response.data.type || mimeType || 'image/jpeg'
          if (skipPng && (type === 'image/png' || type === 'image/x-png')) {
            reject(new Error('SKIP_PNG'))
            return
          }
          const binaryString = atob(base64)
          const len = binaryString.length
          const bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          if (skipPng) {
            const pngMagic = [0x89, 0x50, 0x4E, 0x47]
            if (bytes.length >= 4 && pngMagic.every((b, i) => bytes[i] === b)) {
              reject(new Error('SKIP_PNG'))
              return
            }
          }
          const blob = new Blob([bytes], { type })
          const file = new File([blob], filename, { type })
          resolve(file)
        } catch (err) {
          reject(err)
        }
      })
    })
  }

  async function uploadMediaAsync(data) {
    const mediaResults = []

    let images = Array.isArray(data.images) ? data.images : []
    if (images.length === 0) {
      for (let i = 0; i < 9; i++) {
        const key = i === 0 ? 'ps_item_cover_image' : `ps_item_image_${i}`
        const url = data[key]
        if (url) images.push(url)
      }
    }

    const videos = Array.isArray(data.videos) ? data.videos : []

    if (images.length > 0) {
      console.log(`[SGC] Found ${images.length} images to upload`)
      const imageContainer = document.querySelector('[data-product-edit-field-unique-id="images"]')

      if (!imageContainer) {
        mediaResults.push({ field: '商品圖片', ok: false, error: '找不到圖片上傳容器' })
      } else {
        const fileInputs = Array.from(imageContainer.querySelectorAll('input[type="file"]'))
        if (fileInputs.length === 0) {
          mediaResults.push({ field: '商品圖片', ok: false, error: '找不到圖片上傳 input 欄位' })
        } else {
          const existingUrls = new Set()
          imageContainer.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
            if (src) existingUrls.add(src.split('?')[0].replace(/\/$/, ''))
          })

          const downloadedFiles = []
          for (const url of images) {
            const cleanUrl = url.split('?')[0].replace(/\/$/, '')
            if (existingUrls.has(cleanUrl)) {
              console.log(`[SGC] Skipping already uploaded image: ${url}`)
              continue
            }
            if (downloadedFiles.length >= 9) {
              console.log('[SGC] Reached 9-image limit, skipping remaining')
              break
            }
            try {
              let ext = 'jpg'
              if (url.includes('.png') || url.includes('.PNG')) ext = 'png'
              const filename = `img_${Date.now()}_${downloadedFiles.length + 1}.${ext}`
              const file = await downloadMediaAsFile(url, filename, ext === 'png' ? 'image/png' : 'image/jpeg', true)
              downloadedFiles.push(file)
              console.log(`[SGC] Downloaded image ${downloadedFiles.length}/9: ${url}`)
            } catch (e) {
              if (e.message === 'SKIP_PNG') {
                console.log(`[SGC] Skipped PNG image: ${url}`)
              } else {
                console.error(`[SGC] Failed to download image ${url}:`, e)
              }
            }
          }

          if (downloadedFiles.length > 0) {
            try {
              const firstInput = fileInputs[0]
              if (firstInput && (firstInput.multiple || firstInput.hasAttribute('multiple'))) {
                const dt = new DataTransfer()
                downloadedFiles.forEach(file => dt.items.add(file))
                firstInput.value = ''
                firstInput.files = dt.files
                firstInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
                firstInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
                firstInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
                console.log(`[SGC] Injected all ${downloadedFiles.length} files to multiple-enabled input`)
              } else {
                for (let i = 0; i < downloadedFiles.length; i++) {
                  const currentInputs = Array.from(imageContainer.querySelectorAll('input[type="file"]'))
                  if (currentInputs.length === 0) {
                    console.warn('[SGC] No file inputs found during iteration', i)
                    break
                  }
                  const targetInput = currentInputs[i] || currentInputs[currentInputs.length - 1]
                  const dt = new DataTransfer()
                  dt.items.add(downloadedFiles[i])
                  targetInput.value = ''
                  targetInput.files = dt.files
                  targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
                  targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
                  targetInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
                  console.log(`[SGC] Injected file ${i + 1}/${downloadedFiles.length} to input`)
                  await new Promise(r => setTimeout(r, 500))
                }
              }
              const skipped = images.length - downloadedFiles.length - (images.length > 9 ? images.length - 9 : 0)
              const note = `成功注入 ${downloadedFiles.length} 張圖片` + (skipped > 0 ? `，略過 ${skipped} 張重複` : '')
              mediaResults.push({ field: '商品圖片', ok: true, note })
            } catch (e) {
              mediaResults.push({ field: '商品圖片', ok: false, error: `注入圖片失敗: ${e.message}` })
            }
          } else {
            mediaResults.push({ field: '商品圖片', ok: false, error: '無圖片成功下載（可能已全部存在）' })
          }
        }
      }
    }

    if (videos.length > 0) {
      console.log(`[SGC] Found ${videos.length} videos to upload`)
      const videoContainer = document.querySelector('[data-product-edit-field-unique-id="videos"], [data-product-edit-field-unique-id="video"]')

      if (!videoContainer) {
        mediaResults.push({ field: '商品影片', ok: false, error: '找不到影片上傳容器' })
      } else {
        const fileInputs = Array.from(videoContainer.querySelectorAll('input[type="file"]'))
        if (fileInputs.length === 0) {
          mediaResults.push({ field: '商品影片', ok: false, error: '找不到影片上傳 input 欄位' })
        } else {
          const downloadedVideos = []
          for (const url of videos) {
            if (downloadedVideos.length >= 1) {
              console.log('[SGC] Only uploading 1 video, skipping remaining')
              break
            }
            try {
              const filename = `video_${Date.now()}.mp4`
              const file = await downloadMediaAsFile(url, filename, 'video/mp4', false)
              downloadedVideos.push(file)
              console.log(`[SGC] Downloaded video: ${url}`)
            } catch (e) {
              console.error(`[SGC] Failed to download video ${url}:`, e)
            }
          }

          if (downloadedVideos.length > 0) {
            try {
              const targetInput = fileInputs[0]
              const dt = new DataTransfer()
              downloadedVideos.forEach(file => dt.items.add(file))
              targetInput.value = ''
              targetInput.files = dt.files
              targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }))
              targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true, composed: true }))
              targetInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true, composed: true }))
              console.log(`[SGC] Injected ${downloadedVideos.length} video(s)`)
              mediaResults.push({ field: '商品影片', ok: true, note: `成功注入 ${downloadedVideos.length} 部影片` })
            } catch (e) {
              mediaResults.push({ field: '商品影片', ok: false, error: `注入影片失敗: ${e.message}` })
            }
          } else {
            mediaResults.push({ field: '商品影片', ok: false, error: '無影片成功下載' })
          }
        }
      }
    }

    return mediaResults
  }

  window.__SGC.uploadMediaAsync = uploadMediaAsync
})()
