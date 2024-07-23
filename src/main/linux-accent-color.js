import { spawn } from 'child_process'

const strategies = [
  xdgDesktopPortal,
  ubuntu,
  gnomeCustomAccentColorExtension
]

/**
 * Remember which strategy worked, so we don't need to try every one each time {@linkcode getLinuxAccentColor} is called.
 * * `undefined` means that the {@linkcode getLinuxAccentColor} hasn't been run yet.
 * * `-1` means that none of the strategies worked.
 * * Any other number is the index of the strategy that worked.
 */
let usedStrategyIndex

/**
 * Tries various strategies to get the accent color on Linux.
 * Returns `null` if none of the strategies worked.
 *
 * Supported accent color implementations:
 * * Ubuntu 22+
 * * Gnome Shell Extension: "Custom Accent Colors"
 */
export async function getLinuxAccentColor() {
  if (typeof usedStrategyIndex === 'number') {
    if (usedStrategyIndex === -1) {
      return null
    } else {
      return await strategies[usedStrategyIndex]()
    }
  }

  // uncomment if you need to debug
  // don't log by default, as it's entirely possible that multiple strategies will fail before one succeeds
  // so logging might unnecessarily alarm users

  // const errors = []

  for (let i = 0; i < strategies.length; i++) {
    try {
      const accentColor = await strategies[i]()

      if (accentColor !== null) {
        usedStrategyIndex = i
        return accentColor
      }
    } catch { }
    // } catch (error) {
    //   errors.push(error)
    // }
  }

  usedStrategyIndex = -1

  // console.error(errors)

  return null
}

/**
 * @see https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Settings.html
 * @see https://dbus.freedesktop.org/doc/dbus-send.1.html
 */
async function xdgDesktopPortal() {
  const output = await runCommandHelper('dbus-send', [
    '--print-reply=literal',
    '--type=method_call',
    '--dest=org.freedesktop.portal.Desktop',
    '/org/freedesktop/portal/desktop',
    'org.freedesktop.portal.Settings.ReadOne',
    'string:org.freedesktop.appearance',
    'string:accent-color'
  ])

  const matches = [...output.trim().matchAll(/double\s+(\d+(?:[,.]\d+)?)/g)]

  if (matches.length !== 3) {
    return null
  }

  let hex = '#'

  for (const match of matches) {
    const value = parseFloat(match[1])

    // settings portal docs say to treat out-of-range rbg values as an unset accent color
    if (value < 0.0 || value > 1.0) {
      return null
    }

    hex += Math.floor(value * 255).toString(16).padStart(2, '0')
  }

  return hex
}

/**
 * Ubuntu's accent colors are implemented with various different Yaru themes
 * the gtk-theme and icon-theme settings get set accordingly.
 *
 * @see https://askubuntu.com/questions/1418970/how-to-change-accent-colour-in-ubuntu-22-via-terminal
 */
async function ubuntu() {
  const output = await runCommandHelper('gsettings', ['get', 'org.gnome.desktop.interface', 'gtk-theme'])

  const match = output.trim().match(/^'Yaru(?:-(bark|sage|olive|viridian|prussiangreen|blue|purple|magenta|red))?(?:-dark)?'$/)

  if (!match) {
    return null
  }

  switch (match[1]) {
    case undefined: // the theme for the orange accent color is just called "Yaru"
      return '#e95420'
    case 'bark':
      return '#787859'
    case 'sage':
      return '#657b69'
    case 'olive':
      return '#4b8501'
    case 'viridian':
      return '#03875b'
    case 'prussiangreen':
      return '#308280'
    case 'blue':
      return '#0073e5'
    case 'purple':
      return '#7764d8'
    case 'magenta':
      return '#b34bc3'
    case 'red':
      return '#da3450'
    default:
      return null
  }
}

/**
 * @see https://extensions.gnome.org/extension/5547/custom-accent-colors/
 * @see https://github.com/demetrisk03/custom-accent-colors
 */
async function gnomeCustomAccentColorExtension() {
  const output = await runCommandHelper('gsettings', ['get', 'org.gnome.shell.extensions.custom-accent-colors', 'accent-color'])

  const match = output.trim().match(/^'(green|yellow|orange|red|pink|purple|brown)'$/)

  if (!match) {
    return null
  }

  switch (match[1]) {
    case 'green':
      return '#2ec27e'
    case 'yellow':
      return '#f5c211'
    case 'orange':
      return '#e66100'
    case 'red':
      return '#c01c28'
    case 'pink':
      return '#dc8add'
    case 'purple':
      return '#813d9c'
    case 'brown':
      return '#865e3c'
    default:
      return null
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function runCommandHelper(command, args) {
  return new Promise((resolve, reject) => {
    let error = null
    let output = ''
    let errorOutput = ''

    const child = spawn(command, args)

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (data) => {
      output += data
    })

    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (data) => {
      errorOutput += data
    })

    child.on('error', (err) => {
      error = err
    })

    child.on('close', () => {
      if (error) {
        reject(error)
      } else if (child.exitCode !== 0) {
        // eslint-disable-next-line prefer-promise-reject-errors
        reject(`Exit code: ${child.exitCode}, Stderr: ${errorOutput}`)
      } else {
        resolve(output)
      }
    })
  })
}
