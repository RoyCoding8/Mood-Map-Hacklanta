export function getMoodTotals(pins, moods) {
  const totals = {}
  moods.forEach(mood => { totals[mood.label] = 0 })
  pins.forEach(pin => {
    if (totals[pin.mood] !== undefined) totals[pin.mood]++
  })
  return totals
}

export function getDominantMood(moodTotals, pinCount) {
  if (!pinCount) return null
  return Object.entries(moodTotals).sort((a, b) => b[1] - a[1])[0][0]
}

export function getMapOverlayColor({ crisisMode, resolutionMode, dominantMood }) {
  if (crisisMode && !resolutionMode) return 'rgba(183,28,28,0.09)'
  if (resolutionMode) return 'rgba(76,175,80,0.07)'
  if (dominantMood === 'Stressed') return 'rgba(244,67,54,0.05)'
  if (dominantMood === 'Happy') return 'rgba(76,175,80,0.05)'
  return 'transparent'
}

export function getLiveCounterClassName({ crisisMode, resolutionMode }) {
  if (crisisMode && !resolutionMode) return 'live-counter live-counter-danger'
  if (resolutionMode) return 'live-counter live-counter-success'
  return 'live-counter'
}

export function derivePinVisualState({
  pin,
  resolvedPinIds,
  sosPinIds,
  happyPlaceIds,
  crisisPinIds,
  wavePinIds,
  newPinIds,
  userPinIds,
  happyPlaces,
  supportRipple,
}) {
  const isResolved = resolvedPinIds.has(pin.id)
  const isSOS = sosPinIds.has(pin.id)
  const isHappyPlace = !isSOS && happyPlaceIds.has(pin.id)
  const isCrisis = !isResolved && !isSOS && !isHappyPlace && crisisPinIds.has(pin.id)
  const isWave = !isResolved && !isSOS && !isHappyPlace && !isCrisis && wavePinIds.has(pin.id)
  const isNew = !isResolved && !isSOS && !isHappyPlace && !isCrisis && !isWave && newPinIds.has(pin.id)
  const isUserPin = userPinIds.has(pin.id)
  const hasStory = !!pin.hasStory
  const hpData = isHappyPlace ? happyPlaces.find(place => place.id === pin.id) : null

  const className =
    isSOS ? 'sos-pin'
      : isHappyPlace ? 'happy-place-pin'
        : isResolved ? 'resolved-pin'
          : isCrisis ? 'crisis-pin'
            : isWave ? 'wave-pin'
              : hasStory ? 'story-pin'
                : isNew ? 'pin-new'
                  : supportRipple === pin.id ? 'pin-support-ripple'
                    : ''

  return {
    isResolved,
    isSOS,
    isHappyPlace,
    isCrisis,
    isWave,
    isNew,
    isUserPin,
    hasStory,
    hpData,
    className,
  }
}
