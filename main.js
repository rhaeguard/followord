// TODOs
// + Each Keyboard Key size should be measured for that specific character
// + Shorter vibrate ms
// + Long words shrink if they exceed the width of the keyboard
// + Better word list
// - Better text compression [no need]
// + Better instructions
// + Unaccepted/jitter words trigger vibration
// - Vibrate doesn't work on iPhone [no fix for this]
// + Each letter will have intensity the more words you use starting with that letter

function createCanvas(width, height) {
  const ratio = Math.ceil(window.devicePixelRatio);
  const canvas = document.getElementById("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
  return canvas;
}

function vibrate(value) {
    try {
        navigator.vibrate(value)
    } catch (err) {}
}

const [WIDTH, HEIGHT] = [window.innerHeight * (9/16), window.innerHeight]
const canvas = createCanvas(WIDTH, HEIGHT)

const ctx = canvas.getContext("2d")

function setupAudio() {
    const audioElement = document.getElementById("audio")

    const audioCtx = new AudioContext()
    const track = new MediaElementAudioSourceNode(audioCtx, {mediaElement: audioElement})

    // volume control
    const gainNode = new GainNode(audioCtx)
    gainNode.gain.volume = 0.3

    // pan control
    const panner = new StereoPannerNode(audioCtx, {pan: 0});

    track
        .connect(gainNode)
        .connect(panner)
        .connect(audioCtx.destination)

    return audioCtx
}

const audioCtx = setupAudio();

let previousTime = 0;
let oldWords = [];
let currentWord = "";
let allWords = new Set();
let currentWordJitterFrameCount = -1;
let score = 0;
let scoreJitterFrameCount = -1;
let secondsLeft = 16;
let isHomeScreen = true;
let isGameOver = false;
let isTimed = true;
let maxScore = 0;
let instructionsAnimationAlpha = 0.2;

let stats = ({
    reset: function() {
        this.data = [...Array(26).keys()]
            .map(e => String.fromCharCode(e + 97))
            .reduce(
                (obj, char) => {
                    obj[char] = 0; 
                    return obj
                },
                ({})
            )
        return this;
    },
    update: function(word) {
        const char = word.toLowerCase()[0]
        this.data[char] += 1
        this.total = Object.keys(this.data).map(k => this.data[k]).reduce((sum, a) => sum + a, 0);
    },
    getIntensity: function(char) {
        if (this.total < 5) {
            return null
        }
        char = char.toLowerCase()
        if (this.data[char]) {
            return this.data[char] / this.total
        }
        return null;
    }
}).reset();

let keyboard = ({
    computeDimensions: function() {
        this.keys = []
        const w = WIDTH * 0.9
        const h = (HEIGHT / 2) * 0.5
        const x = (WIDTH - w) / 2
        const y = (HEIGHT / 2) + (HEIGHT/1.8 - h) / 2
        
        const top = "QWERTYUIOP"
        const mid = "ASDFGHJKL"
        const bottom = "ZXCVBNM"
        const gapX = (w * 0.1) / 9
        const gapY = (h * 0.1) / 3
        this.keyWidth = (w - (top.length-1) * gapX) / top.length
        this.keyHeight = (h - 2 * gapY) / 3

        this.bigKeyWidth = (w - (this.keyWidth * bottom.length + gapX * (bottom.length - 1)) - gapX * 2) / 2;
        
        const [letterMaxSize, letterFont] = Array.from(top + mid + bottom).map(ch => getBiggestFittingFontSize(
            this.keyWidth * 0.4, 
            this.keyHeight * 0.4, 
            ch, 
            (px) => `bold ${px}px Arial`, 
            30
        )).reduce((a, b) => Math.max(a[0], b[0]) === a[0] ? a : b, [-Infinity, ""]);

        const doForRow = (row, yy) => {
            const size = row.length
            yy += (this.keyHeight + gapY)
            let xx = x + (((w - (size * this.keyWidth + (size - 1) * gapX)) / 2) - gapX)
            for (let i = 0; i < size; i++) {
                const char = row.charAt(i)
                xx += gapX
                this.keys.push([xx, yy, char, letterFont])
                xx += this.keyWidth
            }
            return {xx, yy}
        }
        
        let xx
        let yy = y - (this.keyHeight + gapY)
        for (let row of [top, mid, bottom]) {
            let out = doForRow(row, yy)
            xx = out.xx
            yy = out.yy
        }
        
        const [_i1, delFontTemplate] = getBiggestFittingFontSize(this.bigKeyWidth * 0.7, this.keyHeight * 0.7, "Del", (px) => `bold ${px}px Arial`, 20)
        const [_i2, enterFontTemplate] = getBiggestFittingFontSize(this.bigKeyWidth * 0.7, this.keyHeight * 0.7, "Ent", (px) => `bold ${px}px Arial`, 20)
        this.keys.push([xx + gapX, yy, "Del", delFontTemplate])
        this.keys.push([x, yy, "Ent", enterFontTemplate])
        this.posx = x;
        this.posy = y;
        this.w = w;

        return this
    },
    draw: function() {
        for (let [xx, yy, char, font] of this.keys) {
            let width, text
            if (char == "Ent" || char == "Del") {
                width = this.bigKeyWidth
                text = char
            } else {
                width = this.keyWidth
                text = char
            }
            
            {
                ctx.save()
                ctx.beginPath()
                ctx.roundRect(xx, yy, width, this.keyHeight, [width/5])
                ctx.clip()
                const intensity = stats.getIntensity(text);
                ctx.fillStyle = `rgb(150 0 0)`;
                ctx.fillRect(
                    xx, 
                    yy + this.keyHeight * (1 - intensity), 
                    width, 
                    this.keyHeight * intensity, 
                )

                ctx.restore()

                ctx.strokeStyle = "white"
                ctx.beginPath()
                ctx.roundRect(xx, yy, width, this.keyHeight, [width/5])
                ctx.stroke()
                drawTextInSquare(
                    xx, yy, width, this.keyHeight,
                    text, font, 
                    "white"
                )
            }
        }
    },
    getPressedKey: function(mx, my) {
        for (let entry of this.keys) {
            const [xx, yy, char] = entry

            const width = (char.length > 1) ? this.bigKeyWidth : this.keyWidth;
            
            const isHit = (mx >= xx && mx <= xx + width) && (my >= yy && my <= yy + this.keyHeight) 
            
            if (isHit) {
                return char
            }
        }
        return null
    }
}).computeDimensions();

const startButton = ({
    computeDimensions: function(x, y){
        this.radius = WIDTH * 0.15
        this.x = x
        this.y = y

        return this
    },
    draw: function(text, progress) {
        const alpha = 20 + (Math.abs(progress) / 1.8) * 100;

        const [_p0, font] = getSmallestFittingFontSize(
            this.radius * 2 * 0.7, 
            this.radius * 2 * 0.7, 
            text, 
            (px) => `bold ${px}px Arial`, 
            100
        );

        const prevLW = ctx.lineWidth;
        ctx.beginPath()
        ctx.lineWidth = this.radius * 0.1
        ctx.strokeStyle = `rgb(255 255 255 / ${alpha}%)`
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.stroke()
        ctx.lineWidth = prevLW; // restore it so that it doesn't affect anything else

        drawTextInSquare(
            this.x - this.radius, 
            this.y - this.radius, 
            this.radius * 2, 
            this.radius * 2,
            text, 
            font, 
            `rgb(255 255 255 / ${alpha}%)`
        )
    },
    isPressed: function(mx, my) {
        const dist = Math.sqrt((mx - this.x) * (mx - this.x) + (my - this.y) * (my - this.y));
        return dist <= this.radius
    }
}).computeDimensions(WIDTH/2, HEIGHT * 0.75);

function getPerfectFontSizeCalc(text, startPixelSize, fontTemplateFn, progressFn, fitCheckFn) {
    let perfectSizeSoFar = startPixelSize;
    let currentPxSize = startPixelSize;
    for (let i=0; i < 40; i++) {
        ctx.font = fontTemplateFn(currentPxSize)
        const {width, actualBoundingBoxAscent, actualBoundingBoxDescent} = ctx.measureText(text)
        const height = actualBoundingBoxAscent + actualBoundingBoxDescent;

        const fits = fitCheckFn(width, height)
        const out = progressFn(currentPxSize, perfectSizeSoFar, fits)
        let ok = out[0]
        currentPxSize = out[1]
        perfectSizeSoFar = out[2]

        if (!ok) {
            break
        }
    }

    return [perfectSizeSoFar, fontTemplateFn(perfectSizeSoFar)];
}

function getBiggestFittingFontSize(width, height, text, fontTemplateFn, startPixelSize) {
    return getPerfectFontSizeCalc(
        text, 
        startPixelSize, 
        fontTemplateFn, 
        (currentPx, perfectSizeSoFar, fits) => {
            const ok = fits;
            const newCurrentPx = fits ?  Math.floor(currentPx * 1.1) : currentPx;
            const newPerfectPx = fits ? currentPx : perfectSizeSoFar;
            return [ok, newCurrentPx, newPerfectPx]
        },
        (w, h) => w <= width && h <= height
    )
}

function getSmallestFittingFontSize(width, height, text, fontTemplateFn, startPixelSize) {
    return getPerfectFontSizeCalc(
        text, 
        startPixelSize, 
        fontTemplateFn, 
        (currentPx, perfectSizeSoFar, fits) => {
            const ok = !fits;
            const newCurrentPx = fits ? currentPx : Math.floor(currentPx * 0.9);
            const newPerfectPx = fits ? currentPx : perfectSizeSoFar;
            return [ok, newCurrentPx, newPerfectPx]
        },
        (w, h) => w <= width && h <= height
    )
}

function drawTextInSquare(x, y, width, height, text, font, fillStyle) {
    ctx.font = font
    ctx.fillStyle = fillStyle
    // draws text inside a square at position
    const measurement = ctx.measureText(text)
    const textWidth = measurement.width
    const textHeight = (measurement.actualBoundingBoxAscent + measurement.actualBoundingBoxDescent);
    
    const textVerticalOffset = (height - textHeight) / 2
    const textHorizontalOffset = (width - textWidth) / 2
    
    // remember the y value in fillText is the base of the text, not the top
    ctx.fillText(text, x + textHorizontalOffset, y + textVerticalOffset + textHeight)
}

function renderJitteryText(text, maxDeviation) {
    const index = 1
    const prefixColor = "red"
    const suffixColor = "white"
    //
    const offsetX = (Math.random() * maxDeviation * (currentWordJitterFrameCount % 2 == 0 ? -1 : 1))
    const offsetY = (Math.random() * maxDeviation * (currentWordJitterFrameCount % 2 == 0 ? -1 : 1))
    renderWordsInTheBag(
        text, index, offsetX, offsetY, prefixColor, suffixColor
    )
    currentWordJitterFrameCount -= 1
}

function renderCenteredText(text) {
    const MAX_WIDTH_ALLOWED = WIDTH * 0.5
    const [_i, font] = getSmallestFittingFontSize(
        MAX_WIDTH_ALLOWED, Infinity, text, (px) => `bold ${px}px Arial`, 100
    )
    ctx.font = font;
    const measurement = ctx.measureText(text)
    const textWidth = measurement.width
    const textHeight = (measurement.actualBoundingBoxAscent + measurement.actualBoundingBoxDescent);
    const x = (WIDTH - textWidth) / 2
    const y = (HEIGHT * 0.75 - textHeight) / 2
    const prefix = text.slice(0, text.length - 1)
    const suffix = text.slice(text.length - 1, text.length)

    ctx.fillStyle = "white"
    ctx.fillText(prefix, x, y);

    ctx.fillStyle = "red"
    const prefixWidth = ctx.measureText(prefix).width
    ctx.fillText(suffix, x + prefixWidth, y);
}

function renderWordsInTheBag(
    text, 
    index = 1, 
    offsetX = 0, 
    offsetY = 0, 
    prefixColor = "red",
    suffixColor = "white",
) {
    const [_, font] = getSmallestFittingFontSize(
        WIDTH * 0.9,
        Infinity,
        text,
        (px) => `${px}px serif`,
        (HEIGHT * 70 / 800)
    )
    ctx.font = font;
    let textWidth = ctx.measureText(text).width

    const x = offsetX + (WIDTH - textWidth) / 2
    const y = offsetY + (HEIGHT - (HEIGHT * 100 / 800) * index) / 2
    const prefix = text.slice(0, text.length - 1)
    const suffix = text.slice(text.length - 1, text.length)

    ctx.fillStyle = prefixColor
    ctx.fillText(prefix, x, y);

    ctx.fillStyle = suffixColor
    const prefixWidth = ctx.measureText(prefix).width
    ctx.fillText(suffix, x + prefixWidth, y);
}

function renderHorizontallyCenteredText(
    text, 
    y, 
    fontSize, 
    fillStyle="white", 
    font=`italic ${fontSize}px Arial`
) {
    ctx.font = font;
    ctx.fillStyle = fillStyle
    const textWidth = ctx.measureText(text).width
    const x = (WIDTH - textWidth) / 2
    ctx.fillText(text, x, y);
}

function draw() {
    ctx.fillStyle = "black"
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    if (isHomeScreen) {
        renderCenteredText("followord")
        
        renderHorizontallyCenteredText(
            `every word must start with`,
            HEIGHT * 0.5,
            fontSize=Math.floor(HEIGHT * 30 / 800)
        )
        renderHorizontallyCenteredText(
            `the last letter of the previous`,
            HEIGHT * 0.5 + 40,
            fontSize=Math.floor(HEIGHT * 30 / 800)
        )
        startButton.draw("start", instructionsAnimationAlpha)
        return
    }

    if (isGameOver) {
        renderCenteredText("game over")
        renderHorizontallyCenteredText(
            `max chain length`,
            HEIGHT * 0.45,
            fontSize=Math.floor(HEIGHT * 40 / 800)
        )
        renderHorizontallyCenteredText(
            `${maxScore}`,
            HEIGHT * 0.50 + 40,
            fontSize=Math.floor(HEIGHT * 60 / 800)
        )
        startButton.draw("restart", instructionsAnimationAlpha)
        return
    }

    // render past words
    for (let i = 0; i < oldWords.length; i++) {
        const alpha = 100 - (oldWords.length - i + 1) * 15
        let color = `rgb(255 255 255 / ${alpha}%)`
        renderWordsInTheBag(
            oldWords[i],
            index = oldWords.length - i + 1,
            offsetX = 0,
            offsetY = 0,
            prefixColor = color,
            suffixColor = color
        )
    }
    keyboard.draw()

    // render current word
    if (currentWordJitterFrameCount < 0) {
        renderWordsInTheBag(currentWord)
    } else {
        let maxDeviation = 15
        renderJitteryText(currentWord, maxDeviation)
        vibrate(10);
    }

    
    // render timer
    ctx.fillStyle = "red"
    const ty = HEIGHT/2 + (keyboard.posy - HEIGHT/2) / 1.5;
    const progress = (1 - (secondsLeft / 16)) / 2;
    ctx.fillRect(
        WIDTH * progress, ty, WIDTH - WIDTH * progress * 2, HEIGHT * 0.01
    )

    const sy = HEIGHT/2 + (ty - HEIGHT/2) / 1.5;
    renderHorizontallyCenteredText(
        `${score}`, 
        sy, 
        0, 
        `gray`, 
        `bold ${Math.floor(HEIGHT * 45 / 800)}px Arial`
    )
}

function update(dt) {
    secondsLeft -= (dt * Number(isTimed))
    isGameOver = secondsLeft <= 0
    if (instructionsAnimationAlpha + dt > 1.8) {
        instructionsAnimationAlpha *= -1
    }
    instructionsAnimationAlpha += dt
}

function loop(currentTime) {
    currentTime = currentTime * 0.001
    const dt = currentTime - previousTime;
    previousTime = currentTime;
    update(dt)
    draw()
    window.requestAnimationFrame(loop)
}

function getRandomFromSet(set) {
    const randomIndex = Math.floor(Math.random() * set.size);
    let i = 0;
    for (const item of set) {
        if (i === randomIndex) return item;
        i++;
    }
}

function run() {
    const alpha = /^[A-Za-z]$/

    fetch("unsorted.txt")
        .then(file => file.text())
        .then(wordsFile => {
            wordsFile.split("\n").forEach(word => {
                word = word.trim()
                if (word.length > 1) {
                    allWords.add(word)
                }
            })
            const randomWord = getRandomFromSet(allWords)
            oldWords.push(randomWord)
            stats.reset()
            currentWord = randomWord.charAt(randomWord.length - 1)
            return true
        })
        .then(() => {
            addEventListener("keyup", (event) => {
                if (event.code === "Backspace") {
                    currentWord = currentWord.slice(0, currentWord.length - 1)
                } else if (alpha.test(event.key)) {
                    currentWord += event.key.toLowerCase()
                } else if (event.code === "Enter") {
                    const mustNotBeEmpty = currentWord.trim().length > 0
                    const mustBeWord = allWords.has(currentWord)
                    const mustBeNew = !oldWords.includes(currentWord)
                    const lastWord = oldWords[oldWords.length - 1]
                    const mustStartWithLastLetter = mustNotBeEmpty && lastWord.charAt(lastWord.length - 1) === currentWord.charAt(0)
                    if (mustBeWord && mustBeNew && mustStartWithLastLetter) {
                        oldWords.push(currentWord)
                        stats.update(currentWord)
                        currentWord = currentWord.slice(currentWord.length - 1, currentWord.length)
                        score += 1
                        if (score > maxScore) {
                            maxScore = score
                        }
                        scoreJitterFrameCount = 16
                        secondsLeft = 16
                    } else {
                        currentWordJitterFrameCount = 16
                    }
                } else if (event.code === "Space" && (isGameOver == true || isHomeScreen == true)) {
                    oldWords = []
                    const randomWord = getRandomFromSet(allWords)
                    oldWords.push(randomWord)
                    stats.reset()
                    currentWord = randomWord.charAt(randomWord.length - 1)
                    scoreJitterFrameCount = 16
                    secondsLeft = 16
                    currentWordJitterFrameCount = 16
                    score = 0
                    isGameOver = false
                    isHomeScreen = false
                }
            });


            canvas.addEventListener("mouseup", (event) => {
                if (isHomeScreen || isGameOver) {
                    if (startButton.isPressed(event.offsetX, event.offsetY)) {
                        let event = new KeyboardEvent(
                            "keyup", { code: "Space", key: "Space"}
                        )
                        window.dispatchEvent(event)
                    }
                } else {
                    const out = keyboard.getPressedKey(event.offsetX, event.offsetY)

                    if (out != null) {
                        let code, key;
                        if (out === "Ent") {
                            code = "Enter"
                            key = "Enter"
                        } else if (out === "Del") {
                            code = "Backspace"
                            key = "Backspace"
                        } else {
                            code = `Key${out}`
                            key = out.toLowerCase()
                        }

                        let event = new KeyboardEvent(
                            "keyup", { code, key}
                        )
                        window.dispatchEvent(event)
                        vibrate(60);
                    }
                }
            })

            try {
                const audio = document.getElementById("audio")
                audio.play()
            } catch(e) {
            } finally {}
            window.requestAnimationFrame(loop)
        })
}

run()