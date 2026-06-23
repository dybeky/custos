import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-glow` is a custom text-shadow utility (see styles/index.css), not a text
// color. Register it in its own class group so tailwind-merge never folds it into
// the text-color group and drops a sibling color like `text-scan`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'text-shadow': [{ text: ['glow'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
