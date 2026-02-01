const getJenksBreaks = (data, desiredClassCount) => {
  const sorted = data.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  const dataLength = sorted.length
  if (!dataLength) {
    return []
  }

  const classCount = Math.max(1, Math.min(desiredClassCount, dataLength))
  const lowerClassLimits = Array.from({ length: dataLength + 1 }, () => Array(classCount + 1).fill(0))
  const varianceCombinations = Array.from({ length: dataLength + 1 }, () => Array(classCount + 1).fill(0))

  for (let i = 1; i <= classCount; i += 1) {
    varianceCombinations[0][i] = 0
    lowerClassLimits[0][i] = 1
    for (let j = 1; j <= dataLength; j += 1) {
      varianceCombinations[j][i] = Number.POSITIVE_INFINITY
    }
  }

  for (let l = 1; l <= dataLength; l += 1) {
    let sum = 0
    let sumSquares = 0
    let count = 0

    for (let m = 1; m <= l; m += 1) {
      const value = sorted[l - m]
      count += 1
      sum += value
      sumSquares += value * value
      const variance = sumSquares - (sum * sum) / count
      if (l === m) {
        continue
      }
      for (let j = 1; j <= classCount; j += 1) {
        if (varianceCombinations[l][j] >= variance + varianceCombinations[l - count][j - 1]) {
          lowerClassLimits[l][j] = l - count + 1
          varianceCombinations[l][j] = variance + varianceCombinations[l - count][j - 1]
        }
      }
    }
    lowerClassLimits[l][1] = 1
    varianceCombinations[l][1] = sumSquares - (sum * sum) / count
  }

  const breaks = Array(classCount + 1).fill(0)
  breaks[classCount] = sorted[dataLength - 1]
  breaks[0] = sorted[0]

  let countNum = classCount
  let k = dataLength

  while (countNum > 1) {
    const index = lowerClassLimits[k][countNum] - 1
    breaks[countNum - 1] = sorted[index]
    k = lowerClassLimits[k][countNum] - 1
    countNum -= 1
  }

  return breaks
}

const normalizeJenksColors = (breaks) => {
  if (!breaks?.length) {
    return []
  }
  const classCount = breaks.length - 1
  if (classCount === REGISTERED_VOTER_COLORS.length) {
    return REGISTERED_VOTER_COLORS
  }
  if (classCount < REGISTERED_VOTER_COLORS.length) {
    return REGISTERED_VOTER_COLORS.slice(REGISTERED_VOTER_COLORS.length - classCount)
  }
  return REGISTERED_VOTER_COLORS
}

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Modal } from 'bootstrap'
import Chart from 'chart.js/auto'
import { FaFilter, FaInfoCircle, FaTimes } from 'react-icons/fa'
import 'leaflet/dist/leaflet.css'
import './index.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

const DEFAULT_CENTER = [-0.4, 37.8]
const DEFAULT_ZOOM = 6.3
const COLOR_MODES = [
  { key: 'party', label: 'Party' },
  { key: 'impeachment', label: 'Impeachment Vote' },
  { key: 'budget', label: '2024 Budget Vote' },
  { key: 'registered_voters', label: 'Registered Voters' },
]
const PARTY_COLORS = {
  uda: '#FFDD00',
  odm: '#FF7F00',
  jp: '#E60000',
  wiper: '#0033A0',
  udm: '#B89300',
  anc: '#008000',
  'ford-kenya': '#009739',
  kanu: '#000000',
  kup: '#800080',
  paa: '#228B22',
  ccm: '#008000',
  upia: '#1E90FF',
  'nap-k': '#0057B7',
  mccp: '#FF6600',
  gddp: '#008080',
  tsp: '#FFC107',
  nopeu: '#FF0000',
  mdg: '#00AEEF',
  upa: '#F59E0B',
  'dap-k': '#000000',
  independent: '#808080',
  others: '#808080',
}
const REGISTERED_VOTER_COLORS = [
  '#f7fbff',
  '#deebf7',
  '#c6dbef',
  '#9ecae1',
  '#6baed6',
  '#4292c6',
  '#2171b5',
  '#08519c',
  '#08306b',
  '#041937',
]
const JENKS_CLASS_COUNT = 10
const VOTE_COLORS = {
  yes: '#10B981',
  no: '#EF4444',
  abstain: '#F59E0B',
}
const BUDGET_COLORS = {
  yes: '#0EA5E9',
  no: '#EF4444',
  abstain: '#F59E0B',
}
const PARTY_BADGE_KEYS = new Set(Object.keys(PARTY_COLORS))
const MAP_PADDING = [20, 20]

const normalizeKey = (value = '') => value.toString().toLowerCase().trim()
const normalizePartyKey = (value = '') => {
  const raw = normalizeKey(value)
  if (!raw) {
    return 'others'
  }
  const cleaned = raw
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

  const aliases = {
    jubilee: 'jp',
    'jubilee party': 'jp',
    jp: 'jp',
    'united democratic alliance': 'uda',
    uda: 'uda',
    'orange democratic movement': 'odm',
    odm: 'odm',
    'wiper democratic movement': 'wiper',
    wiper: 'wiper',
    'ford-kenya': 'ford-kenya',
    'ford kenya': 'ford-kenya',
    'ford–kenya': 'ford-kenya',
    'ford– kenya': 'ford-kenya',
  }

  const normalized = aliases[cleaned] || cleaned.replace(/\s+/g, '-')
  return PARTY_COLORS[normalized] ? normalized : 'others'
}

const PARTY_FULL_NAMES = {
  uda: 'United Democratic Alliance (UDA)',
  odm: 'Orange Democratic Movement (ODM)',
  jp: 'Jubilee Party (JP)',
  wiper: 'Wiper Democratic Movement',
  udm: 'United Democratic Movement (UDM)',
  anc: 'Amani National Congress (ANC)',
  'ford-kenya': 'FORD–Kenya',
  kanu: 'KANU',
  kup: 'Kenya Union Party (KUP)',
  paa: 'Pamoja African Alliance (PAA)',
  ccm: 'Chama Cha Mashinani (CCM)',
  upia: 'United Party of Independent Alliance (UPIA)',
  'nap-k': 'National Agenda Party of Kenya (NAP-K)',
  mccp: 'Maendeleo Chap Chap (MCCP)',
  gddp: 'Grand Dream Development Party (GDDP)',
  tsp: 'The Service Party (TSP)',
  nopeu: 'NOPEU',
  mdg: 'Movement for Democracy and Growth (MDG)',
  upa: 'United Progressive Alliance (UPA)',
  'dap-k': 'Democratic Action Party–Kenya (DAP-K)',
  independent: 'Independent',
  others: 'Others',
}
const VOTE_OPTIONS = [
  { key: 'yes', label: 'YES' },
  { key: 'no', label: 'NO' },
  { key: 'abstain', label: 'ABSTAIN' },
]

const getPartyColor = (partyKey) => PARTY_COLORS[partyKey] || PARTY_COLORS.others
const getVoteColor = (voteKey) => VOTE_COLORS[voteKey] || '#a0aec0'
const getBudgetColor = (voteKey) => BUDGET_COLORS[voteKey] || '#4b5563'
const getRegisteredVoterColor = (value, voterClassification) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || !voterClassification?.breaks?.length) {
    return '#d1d5db'
  }
  const { breaks, colors } = voterClassification
  const classCount = breaks.length - 1
  for (let index = 0; index < classCount; index += 1) {
    const upperBound = breaks[index + 1]
    if (numeric <= upperBound || index === classCount - 1) {
      return colors[index] || colors[colors.length - 1]
    }
  }
  return '#d1d5db'
}

const formatNumber = (value) => {
  if (value === null || value === undefined) {
    return 'N/A'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return value
  }
  return numeric.toLocaleString()
}

const roundToNearestThousand = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }
  return Math.round(numeric / 1000) * 1000
}

const formatThousandRounded = (value) => {
  const rounded = roundToNearestThousand(value)
  if (rounded === null) {
    return 'N/A'
  }
  return formatNumber(rounded)
}

const FILTER_TYPES = [
  { key: 'county', label: 'County' },
  { key: 'party', label: 'Party' },
  { key: 'impeachment', label: 'Impeachment Vote' },
]

const defaultFilters = {
  county: [],
  party: [],
  impeachment: [],
}

function App() {
  const [features, setFeatures] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [colorMode, setColorMode] = useState('party')
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [expandedFilters, setExpandedFilters] = useState({})

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const selectedLayerRef = useRef(null)
  const layerControlRef = useRef(null)
  const layerControlButtonsRef = useRef({})

  const modalElementRef = useRef(null)
  const modalInstanceRef = useRef(null)

  const partyChartCanvasRef = useRef(null)
  const impeachmentChartCanvasRef = useRef(null)
  const budgetChartCanvasRef = useRef(null)
  const chartsRef = useRef({ party: null, impeachment: null, budget: null })

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/constituencies/')
        if (!response.ok) {
          throw new Error('Failed to load constituency data')
        }
        const result = await response.json()
        const normalized = (result.features || []).map((feature) => {
          const properties = feature.properties || {}
          const partyLabel = properties.party || 'Others'
          const partyKey = normalizePartyKey(partyLabel)
          const impeachmentLabel = properties.impeachment_vote || 'Unknown'
          const impeachmentKey = normalizeKey(impeachmentLabel)
          const budgetLabel = properties.budget_vote || 'Unknown'
          const budgetKey = normalizeKey(budgetLabel)
          const updatedName = properties.updated_name?.trim()
          const displayName = updatedName || properties.name
          return {
            ...feature,
            properties: {
              ...properties,
              display_name: displayName,
              party_label: partyLabel,
              party_key: partyKey,
              impeachment_label: impeachmentLabel,
              impeachment_key: impeachmentKey,
              budget_label: budgetLabel,
              budget_key: budgetKey,
            },
          }
        })
        setFeatures(normalized)
      } catch (err) {
        setError(err.message || 'Unexpected error fetching constituencies')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const registeredVoterClassification = useMemo(() => {
    const values = features
      .map((feature) => Number(feature.properties?.registered_voters))
      .filter((value) => Number.isFinite(value) && value >= 0)
    if (values.length === 0) {
      return { breaks: [], colors: [] }
    }
    const breaks = getJenksBreaks(values, JENKS_CLASS_COUNT)
    return {
      breaks,
      colors: normalizeJenksColors(breaks),
    }
  }, [features])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }
    mapRef.current = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 19,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current)

    // Handle window resize to recenter map
    const handleResize = () => {
      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current.invalidateSize()
          if (geoJsonLayerRef.current) {
            const bounds = geoJsonLayerRef.current.getBounds()
            if (bounds.isValid()) {
              mapRef.current.fitBounds(bounds, { padding: [50, 50] })
            } else {
              // Don't fit to any bounds when no geojson layer
            }
          } else {
            // Don't fit to any bounds when no geojson layer
          }
        }, 100)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // (modal + charts are initialized later, after derived data is defined)

  // Center map and highlight selected feature - optimized
  useEffect(() => {
    if (!selectedFeature || !mapRef.current || !geoJsonLayerRef.current) {
      // Remove highlight if no selection
      if (selectedLayerRef.current) {
        selectedLayerRef.current.remove()
        selectedLayerRef.current = null
      }
      return
    }

    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
      if (!mapRef.current || !selectedFeature) return

      // Center map on selected feature without zooming too much
      const bounds = L.geoJSON(selectedFeature).getBounds()
      if (bounds.isValid()) {
        const center = bounds.getCenter()
        const currentZoom = mapRef.current.getZoom()
        // Use current zoom or a reasonable zoom level, don't zoom in too much
        const targetZoom = Math.min(currentZoom, 8)
        mapRef.current.setView(center, targetZoom, { animate: false })
      }

      // Remove previous highlight layer if it exists
      if (selectedLayerRef.current) {
        selectedLayerRef.current.remove()
        selectedLayerRef.current = null
      }

      // Add highlight layer with blinking green border - on top with higher z-index
      selectedLayerRef.current = L.geoJSON(selectedFeature, {
        style: {
          fillColor: 'transparent',
          weight: 6,
          opacity: 1,
          color: '#10b981',
          fillOpacity: 0,
          dashArray: '10, 5',
        },
      }).addTo(mapRef.current)

      // Bring to front to ensure it's visible on top with higher z-index
      if (selectedLayerRef.current) {
        selectedLayerRef.current.bringToFront()
        // Set a higher z-index by manipulating the DOM after a small delay
        setTimeout(() => {
          if (selectedLayerRef.current) {
            selectedLayerRef.current.eachLayer((layer) => {
              if (layer._path) {
                layer._path.style.zIndex = '10000'
                layer._path.style.pointerEvents = 'none'
                layer._path.style.strokeWidth = '6px'
              }
            })
          }
        }, 10)
      }
    })

    // Add blinking animation that continues until selection changes or reset
    const intervalId = setInterval(() => {
      if (selectedLayerRef.current && selectedFeature) {
        requestAnimationFrame(() => {
          if (selectedLayerRef.current) {
            const currentOpacity = selectedLayerRef.current.options.opacity
            selectedLayerRef.current.setStyle({
              opacity: currentOpacity === 1 ? 0.3 : 1,
            })
          }
        })
      }
    }, 500)

    return () => {
      clearInterval(intervalId)
      // Remove layer when effect is cleaned up (when selectedFeature changes or becomes null)
      if (selectedLayerRef.current) {
        selectedLayerRef.current.remove()
        selectedLayerRef.current = null
      }
    }
  }, [selectedFeature])

  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      const props = feature.properties || {}

      if (filters.county.length > 0) {
        const countyMatch = filters.county.some(
          (county) => normalizeKey(props.county) === normalizeKey(county)
        )
        if (!countyMatch) return false
      }

      if (filters.party.length > 0) {
        const partyMatch = filters.party.some(
          (party) => props.party_key === normalizePartyKey(party)
        )
        if (!partyMatch) return false
      }

      if (filters.impeachment.length > 0) {
        const impeachmentMatch = filters.impeachment.some(
          (impeachment) => normalizeKey(props.impeachment_label) === normalizeKey(impeachment)
        )
        if (!impeachmentMatch) return false
      }

      return true
    })
  }, [features, filters])

  const summary = useMemo(() => {
    const totals = {
      total: filteredFeatures.length,
      parties: {},
      impeachment: { yes: 0, no: 0, abstain: 0 },
      budget: { yes: 0, no: 0, abstain: 0 },
      registeredVoters: 0,
    }

    filteredFeatures.forEach((feature) => {
      const props = feature.properties || {}
      const partyKey = props.party_key || 'others'
      totals.parties[partyKey] = (totals.parties[partyKey] || 0) + 1

      const impeachmentKey = props.impeachment_key
      if (impeachmentKey && totals.impeachment[impeachmentKey] !== undefined) {
        totals.impeachment[impeachmentKey] += 1
      }

      const budgetKey = props.budget_key
      if (budgetKey && totals.budget[budgetKey] !== undefined) {
        totals.budget[budgetKey] += 1
      }

      const voters = Number(props.registered_voters)
      if (Number.isFinite(voters)) {
        totals.registeredVoters += voters
      }
    })

    return {
      ...totals,
    }
  }, [filteredFeatures])

  const counties = useMemo(() => {
    return Array.from(new Set(features.map((feature) => feature.properties?.county).filter(Boolean))).sort()
  }, [features])

  const parties = useMemo(() => {
    const mapping = {}
    features.forEach((feature) => {
      const props = feature.properties || {}
      if (props.party_label) {
        const key = props.party_key || normalizeKey(props.party_label)
        if (!mapping[key]) {
          mapping[key] = props.party_label
        }
      }
    })
    return Object.entries(mapping)
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [features])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    // Use requestAnimationFrame for smooth layer updates
    const updateLayer = () => {
      if (!mapRef.current) return

      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.remove()
        geoJsonLayerRef.current = null
      }

      if (!filteredFeatures.length) {
        return
      }

      const layer = L.geoJSON(filteredFeatures, {
        style: (feature) =>
          getStyleForFeature(
            feature.properties,
            colorMode,
            registeredVoterClassification,
          ),
        onEachFeature: (feature, layerInstance) => {
          layerInstance.on('mouseover', (e) => {
            if (window.currentHoverTimeout) clearTimeout(window.currentHoverTimeout)
            setHoveredFeature(feature)
            if (mapRef.current && mapContainerRef.current) {
              const containerPoint = mapRef.current.latLngToContainerPoint(e.latlng)
              setPopupPosition({
                x: containerPoint.x,
                y: containerPoint.y,
              })
            }
          })

          layerInstance.on('mouseout', () => {
            // Longer delay to prevent flickering and allow cursor to move over popup
            window.currentHoverTimeout = setTimeout(() => {
              setHoveredFeature(null)
            }, 300)
          })

          layerInstance.on('mousemove', (e) => {
            if (mapRef.current && mapContainerRef.current) {
              requestAnimationFrame(() => {
                const containerPoint = mapRef.current.latLngToContainerPoint(e.latlng)
                setPopupPosition({
                  x: containerPoint.x,
                  y: containerPoint.y,
                })
              })
            }
          })

          layerInstance.on('click', () => {
            // Use requestAnimationFrame for smooth selection
            requestAnimationFrame(() => {
              setSelectedFeature(feature)
            })
          })
        },
      })

      geoJsonLayerRef.current = layer.addTo(mapRef.current)
    }

    requestAnimationFrame(updateLayer)

    // Close popup when map is dragged
    const closePopup = () => {
      setHoveredFeature(null)
    }

    mapRef.current.on('dragstart', closePopup)
    mapRef.current.on('drag', closePopup)
    mapRef.current.on('click', (e) => {
      // Only close if clicking directly on the map (not on a feature)
      if (e.originalEvent && !e.originalEvent.target.closest('.leaflet-interactive')) {
        closePopup()
      }
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.off('dragstart', closePopup)
        mapRef.current.off('drag', closePopup)
        mapRef.current.off('click')
      }
    }
  }, [filteredFeatures, colorMode, registeredVoterClassification])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }
    if (layerControlRef.current) {
      layerControlRef.current.remove()
      layerControlRef.current = null
      layerControlButtonsRef.current = {}
    }

    const control = L.control({ position: 'topright' })
    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar bi-layer-control')
      container.style.background = '#ffffff'
      container.style.borderRadius = '6px'
      container.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
      container.style.padding = '8px'
      container.style.display = 'flex'
      container.style.gap = '6px'

      const modes = [
        { key: 'party', label: 'Party' },
        { key: 'budget', label: 'Budget' },
        { key: 'impeachment', label: 'Impeachment' },
      ]

      modes.forEach((mode) => {
        const btn = L.DomUtil.create('button', 'btn btn-sm', container)
        btn.type = 'button'
        btn.textContent = mode.label
        btn.className = `btn btn-sm ${colorMode === mode.key ? 'btn-primary' : 'btn-outline-primary'}`
        btn.style.fontWeight = '600'
        L.DomEvent.disableClickPropagation(btn)
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.preventDefault(e)
          setColorMode(mode.key)
        })
        layerControlButtonsRef.current[mode.key] = btn
      })

      return container
    }

    control.addTo(mapRef.current)
    layerControlRef.current = control
  }, [colorMode])

  const handleFilterValueToggle = (filterType, value) => {
    setFilters((prev) => {
      const currentValues = prev[filterType] || []
      const isSelected = currentValues.includes(value)
      if (isSelected) {
        return {
          ...prev,
          [filterType]: currentValues.filter((v) => v !== value),
        }
      } else {
        return {
          ...prev,
          [filterType]: [...currentValues, value],
        }
      }
    })
  }

  const handleResetFilters = () => {
    setFilters(defaultFilters)
    setExpandedFilters({})
  }

  const handleColorModeChange = (mode) => {
    setColorMode(mode)
  }

  const handleResetMapView = () => {
    if (!mapRef.current) {
      return
    }
    // Clear selected feature to remove highlight
    setSelectedFeature(null)
    // Reset to default view
    mapRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
  }

  const handleZoomToSelected = () => {
    if (!mapRef.current || !selectedFeature) {
      return
    }
    const bounds = L.geoJSON(selectedFeature).getBounds()
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: MAP_PADDING })
    }
  }

  const totalConstituencies = features.length
  const filteredConstituencies = filteredFeatures.length

  const topParties = useMemo(() => {
    const counts = summary.parties || {}
    const entries = Object.entries(counts)
      .map(([key, value]) => ({ key, value: Number(value) || 0 }))
      .sort((a, b) => b.value - a.value)

    const top = entries.slice(0, 6)
    const othersCount = entries.slice(6).reduce((acc, item) => acc + item.value, 0)
    const normalized = top.map((item) => ({
      ...item,
      label: PARTY_FULL_NAMES[item.key] || (parties.find((p) => p.value === item.key)?.label || item.key),
      color: PARTY_COLORS[item.key] || PARTY_COLORS.others,
    }))
    if (othersCount > 0) {
      normalized.push({ key: 'others', value: othersCount, label: 'Others', color: PARTY_COLORS.others })
    }
    return normalized
  }, [summary.parties, parties])

  useEffect(() => {
    if (!modalElementRef.current) {
      return
    }

    const element = modalElementRef.current
    if (!modalInstanceRef.current) {
      modalInstanceRef.current = new Modal(element, {
        backdrop: true,
        keyboard: true,
        focus: true,
      })
    }

    const handleHidden = () => {
      setSelectedFeature(null)
    }

    element.addEventListener('hidden.bs.modal', handleHidden)
    return () => {
      element.removeEventListener('hidden.bs.modal', handleHidden)
    }
  }, [])

  useEffect(() => {
    if (!modalInstanceRef.current) {
      return
    }
    if (selectedFeature) {
      modalInstanceRef.current.show()
    } else {
      modalInstanceRef.current.hide()
    }
  }, [selectedFeature])

  useEffect(() => {
    if (!partyChartCanvasRef.current) {
      return
    }
    if (chartsRef.current.party) {
      chartsRef.current.party.destroy()
      chartsRef.current.party = null
    }
    if (!topParties.length) {
      return
    }

    chartsRef.current.party = new Chart(partyChartCanvasRef.current, {
      type: 'doughnut',
      data: {
        labels: topParties.map((p) => p.key.toUpperCase()),
        datasets: [
          {
            data: topParties.map((p) => p.value),
            backgroundColor: topParties.map((p) => p.color),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        cutout: '68%',
      },
    })

    return () => {
      if (chartsRef.current.party) {
        chartsRef.current.party.destroy()
        chartsRef.current.party = null
      }
    }
  }, [topParties])

  useEffect(() => {
    const initStackedBar = (key, canvasRef, dataset, colors) => {
      if (!canvasRef.current) {
        return
      }
      if (chartsRef.current[key]) {
        chartsRef.current[key].destroy()
        chartsRef.current[key] = null
      }

      chartsRef.current[key] = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: [''],
          datasets: [
            {
              label: 'YES',
              data: [dataset.yes || 0],
              backgroundColor: colors.yes,
              borderWidth: 0,
            },
            {
              label: 'NO',
              data: [dataset.no || 0],
              backgroundColor: colors.no,
              borderWidth: 0,
            },
            {
              label: 'ABSTAIN',
              data: [dataset.abstain || 0],
              backgroundColor: colors.abstain,
              borderWidth: 0,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, display: false },
            y: { stacked: true, display: false },
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true },
          },
        },
      })
    }

    initStackedBar('impeachment', impeachmentChartCanvasRef, summary.impeachment || {}, VOTE_COLORS)
    initStackedBar('budget', budgetChartCanvasRef, summary.budget || {}, BUDGET_COLORS)

    return () => {
      ;['impeachment', 'budget'].forEach((key) => {
        if (chartsRef.current[key]) {
          chartsRef.current[key].destroy()
          chartsRef.current[key] = null
        }
      })
    }
  }, [summary.impeachment, summary.budget])

  return (
    <div className="d-flex flex-column vh-100" style={{ background: '#f4f6f9' }}>
      <nav className="navbar navbar-dark navbar-expand-lg" style={{ background: '#0b1f3a' }}>
        <div className="container-fluid">
          <span className="navbar-brand fw-bold">Kenya Legislative Dashboard</span>
          <button
            className="navbar-toggler"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#dashboardSidebar"
            aria-controls="dashboardSidebar"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className="collapse navbar-collapse">
            <div className="navbar-nav ms-auto align-items-lg-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={() => setAboutOpen(true)}
              >
                About
              </button>
              <a
                className="btn btn-sm btn-outline-light"
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                Data Source
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div className="d-flex flex-grow-1 overflow-hidden">
        <aside className="d-none d-lg-flex flex-column border-end bg-white" style={{ width: 350 }}>
          <div className="p-3 overflow-auto">
            <div className="mb-3">
              <div className="btn-group w-100" role="group" aria-label="Map view">
                {['party', 'budget', 'impeachment', 'registered_voters'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`btn btn-sm ${colorMode === mode ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => handleColorModeChange(mode)}
                  >
                    {(COLOR_MODES.find((item) => item.key === mode)?.label || mode).replace('2024 ', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                  Key Stats
                </div>
                <div className="row g-3 mt-1">
                  <div className="col-6">
                    <div className="text-secondary" style={{ fontSize: 12 }}>Total Constituencies</div>
                    <div className="fw-bold" style={{ fontSize: 20 }}>{totalConstituencies || 0}</div>
                  </div>
                  <div className="col-6">
                    <div className="text-secondary" style={{ fontSize: 12 }}>Filtered Constituencies</div>
                    <div className="fw-bold" style={{ fontSize: 20 }}>{filteredConstituencies || 0}</div>
                  </div>
                  <div className="col-12">
                    <div className="text-secondary" style={{ fontSize: 12 }}>Registered Voters (filtered)</div>
                    <div className="fw-bold" style={{ fontSize: 20 }}>{summary.registeredVoters ? formatNumber(summary.registeredVoters) : 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                  Parliamentary Party Strength
                </div>
                <div style={{ height: 180 }} className="position-relative mt-2">
                  <canvas ref={partyChartCanvasRef} />
                </div>
                <div className="mt-3" style={{ fontSize: 13 }}>
                  {topParties.map((party) => (
                    <div key={party.key} className="d-flex align-items-center justify-content-between py-1">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: party.color, display: 'inline-block' }} />
                        <span className="text-dark">{party.key.toUpperCase()}</span>
                      </div>
                      <span className="fw-semibold text-dark">{party.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                  Vote Outcomes
                </div>
                <div className="mt-2">
                  <div className="text-secondary" style={{ fontSize: 12 }}>Impeachment</div>
                  <div style={{ height: 38 }} className="position-relative">
                    <canvas ref={impeachmentChartCanvasRef} />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-secondary" style={{ fontSize: 12 }}>Budget 2024</div>
                  <div style={{ height: 38 }} className="position-relative">
                    <canvas ref={budgetChartCanvasRef} />
                  </div>
                </div>
                <div className="mt-3 d-flex flex-wrap gap-2" style={{ fontSize: 12 }}>
                  <span className="d-flex align-items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: VOTE_COLORS.yes, display: 'inline-block' }} /> YES
                  </span>
                  <span className="d-flex align-items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: VOTE_COLORS.no, display: 'inline-block' }} /> NO
                  </span>
                  <span className="d-flex align-items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: VOTE_COLORS.abstain, display: 'inline-block' }} /> ABSTAIN
                  </span>
                </div>
              </div>
            </div>

            <div className="card shadow-sm">
              <div className="card-body">
                <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                  Filter Map
                </div>
                <div className="accordion mt-2" id="filterAccordion">
                  <div className="accordion-item">
                    <h2 className="accordion-header" id="headingCounty">
                      <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCounty">
                        By County
                      </button>
                    </h2>
                    <div id="collapseCounty" className="accordion-collapse collapse" data-bs-parent="#filterAccordion">
                      <div className="accordion-body">
                        <select
                          className="form-select form-select-sm"
                          value={filters.county?.[0] || ''}
                          onChange={(e) => {
                            const value = e.target.value
                            setFilters((prev) => ({ ...prev, county: value ? [value] : [] }))
                          }}
                        >
                          <option value="">All Counties</option>
                          {counties.map((county) => (
                            <option key={county} value={county}>{county}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="accordion-item">
                    <h2 className="accordion-header" id="headingParty">
                      <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseParty">
                        By Party
                      </button>
                    </h2>
                    <div id="collapseParty" className="accordion-collapse collapse" data-bs-parent="#filterAccordion">
                      <div className="accordion-body" style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {parties.map((party) => {
                          const checked = (filters.party || []).includes(party.value)
                          return (
                            <div key={party.value} className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={checked}
                                id={`party_${party.value}`}
                                onChange={() => handleFilterValueToggle('party', party.value)}
                              />
                              <label className="form-check-label" htmlFor={`party_${party.value}`}>
                                {party.label}
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="accordion-item">
                    <h2 className="accordion-header" id="headingVote">
                      <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVote">
                        By Vote Position (Impeachment)
                      </button>
                    </h2>
                    <div id="collapseVote" className="accordion-collapse collapse" data-bs-parent="#filterAccordion">
                      <div className="accordion-body">
                        {['Yes', 'No', 'Abstain'].map((label) => {
                          const checked = (filters.impeachment || []).includes(label)
                          return (
                            <div key={label} className="form-check">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={checked}
                                id={`vote_${label}`}
                                onChange={() => handleFilterValueToggle('impeachment', label)}
                              />
                              <label className="form-check-label" htmlFor={`vote_${label}`}>
                                {label}
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary w-100 mt-3"
                  onClick={handleResetFilters}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div
          className="offcanvas offcanvas-start"
          tabIndex="-1"
          id="dashboardSidebar"
          aria-labelledby="dashboardSidebarLabel"
          style={{ width: 350 }}
        >
          <div className="offcanvas-header">
            <h5 className="offcanvas-title" id="dashboardSidebarLabel">Dashboard</h5>
            <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Close" />
          </div>
          <div className="offcanvas-body p-0">
            <div className="p-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 70px)' }}>
              <div className="mb-3">
                <div className="btn-group w-100" role="group" aria-label="Map view">
                  {['party', 'budget', 'impeachment', 'registered_voters'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`btn btn-sm ${colorMode === mode ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => handleColorModeChange(mode)}
                    >
                      {(COLOR_MODES.find((item) => item.key === mode)?.label || mode).replace('2024 ', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card shadow-sm mb-3">
                <div className="card-body">
                  <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                    Key Stats
                  </div>
                  <div className="row g-3 mt-1">
                    <div className="col-6">
                      <div className="text-secondary" style={{ fontSize: 12 }}>Total Constituencies</div>
                      <div className="fw-bold" style={{ fontSize: 20 }}>{totalConstituencies || 0}</div>
                    </div>
                    <div className="col-6">
                      <div className="text-secondary" style={{ fontSize: 12 }}>Filtered Constituencies</div>
                      <div className="fw-bold" style={{ fontSize: 20 }}>{filteredConstituencies || 0}</div>
                    </div>
                    <div className="col-12">
                      <div className="text-secondary" style={{ fontSize: 12 }}>Registered Voters (filtered)</div>
                      <div className="fw-bold" style={{ fontSize: 20 }}>{summary.registeredVoters ? formatNumber(summary.registeredVoters) : 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card shadow-sm mb-3">
                <div className="card-body">
                  <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                    Filter Map
                  </div>
                  <div className="accordion mt-2" id="filterAccordionMobile">
                    <div className="accordion-item">
                      <h2 className="accordion-header" id="headingCountyMobile">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseCountyMobile">
                          By County
                        </button>
                      </h2>
                      <div id="collapseCountyMobile" className="accordion-collapse collapse" data-bs-parent="#filterAccordionMobile">
                        <div className="accordion-body">
                          <select
                            className="form-select form-select-sm"
                            value={filters.county?.[0] || ''}
                            onChange={(e) => {
                              const value = e.target.value
                              setFilters((prev) => ({ ...prev, county: value ? [value] : [] }))
                            }}
                          >
                            <option value="">All Counties</option>
                            {counties.map((county) => (
                              <option key={county} value={county}>{county}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="accordion-item">
                      <h2 className="accordion-header" id="headingPartyMobile">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapsePartyMobile">
                          By Party
                        </button>
                      </h2>
                      <div id="collapsePartyMobile" className="accordion-collapse collapse" data-bs-parent="#filterAccordionMobile">
                        <div className="accordion-body" style={{ maxHeight: 240, overflowY: 'auto' }}>
                          {parties.map((party) => {
                            const checked = (filters.party || []).includes(party.value)
                            return (
                              <div key={party.value} className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={checked}
                                  id={`party_mobile_${party.value}`}
                                  onChange={() => handleFilterValueToggle('party', party.value)}
                                />
                                <label className="form-check-label" htmlFor={`party_mobile_${party.value}`}>
                                  {party.label}
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="accordion-item">
                      <h2 className="accordion-header" id="headingVoteMobile">
                        <button className="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseVoteMobile">
                          By Vote Position (Impeachment)
                        </button>
                      </h2>
                      <div id="collapseVoteMobile" className="accordion-collapse collapse" data-bs-parent="#filterAccordionMobile">
                        <div className="accordion-body">
                          {['Yes', 'No', 'Abstain'].map((label) => {
                            const checked = (filters.impeachment || []).includes(label)
                            return (
                              <div key={label} className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={checked}
                                  id={`vote_mobile_${label}`}
                                  onChange={() => handleFilterValueToggle('impeachment', label)}
                                />
                                <label className="form-check-label" htmlFor={`vote_mobile_${label}`}>
                                  {label}
                                </label>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="d-flex gap-2 mt-3">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary flex-grow-1"
                      onClick={handleResetFilters}
                    >
                      Clear Filters
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      data-bs-dismiss="offcanvas"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-grow-1 position-relative overflow-hidden">
          <div className="d-flex flex-column h-100 p-3">
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
              <div className="d-flex align-items-center gap-2">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleResetMapView}>
                  Reset view
                </button>
                {selectedFeature && (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleZoomToSelected}>
                    Zoom to selected
                  </button>
                )}
              </div>
            </div>

            <div className="map-frame flex-grow-1 position-relative overflow-hidden">
              <div className="position-relative h-100 w-100">
                <div ref={mapContainerRef} className="map-canvas" />
                {hoveredFeature && popupPosition.x > 0 && popupPosition.y > 0 && (
                  <PopupContent
                    feature={hoveredFeature}
                    colorMode={colorMode}
                    position={popupPosition}
                    formatNumber={formatNumber}
                  />
                )}
              </div>
              <MapLegend
                mode={colorMode}
                parties={parties}
                features={features}
                registeredVoterClassification={registeredVoterClassification}
              />
            </div>

            {(loading || error) && (
              <div className="position-absolute top-0 start-0 end-0 bottom-0 bg-white bg-opacity-75 d-flex align-items-center justify-content-center">
                {loading ? (
                  <div className="d-flex align-items-center gap-3">
                    <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12" />
                    <div className="fw-semibold text-dark">Loading map data…</div>
                  </div>
                ) : (
                  <div className="text-danger fw-semibold">{error}</div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {aboutOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">About This Application</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setAboutOpen(false)}
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-4 text-gray-700 text-sm">
              <p>This application visualizes Kenya's constituency data using interactive maps.</p>
              <div>
                <h3 className="font-semibold">Features</h3>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Color constituencies by party, impeachment vote, budget vote, or registered voters</li>
                  <li>Filter by county, party, or impeachment vote</li>
                  <li>Explore detailed stats per constituency</li>
                  <li>Review aggregated summaries of party representation and voting patterns</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold">Data Sources</h3>
                <p>Independent Electoral and Boundaries Commission (IEBC) and parliamentary records.</p>
              </div>
              <div>
                <h3 className="font-semibold">Technology</h3>
                <p>Django REST Framework backend with a React + Leaflet frontend.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="modal fade"
        tabIndex="-1"
        aria-hidden="true"
        ref={modalElementRef}
        onClick={(e) => {
          if (e.target === modalElementRef.current) {
            setSelectedFeature(null)
          }
        }}
      >
        <div className="modal-dialog modal-dialog-scrollable modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">
                {selectedFeature?.properties?.display_name || selectedFeature?.properties?.name || 'Constituency'}
              </h5>
              <button
                type="button"
                className="btn-close"
                onClick={() => setSelectedFeature(null)}
              />
            </div>
            <div className="modal-body">
              {selectedFeature ? (
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <div className="card border-0 bg-light">
                      <div className="card-body">
                        <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                          Member of Parliament
                        </div>
                        <div className="fw-bold" style={{ fontSize: 18 }}>{selectedFeature.properties?.mp || 'N/A'}</div>
                        <div className="mt-2 text-secondary" style={{ fontSize: 13 }}>
                          County: <span className="text-dark fw-semibold">{selectedFeature.properties?.county || 'N/A'}</span>
                        </div>
                        <div className="text-secondary" style={{ fontSize: 13 }}>
                          Registered Voters: <span className="text-dark fw-semibold">{formatNumber(selectedFeature.properties?.registered_voters)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="card border-0 bg-light">
                      <div className="card-body">
                        <div className="text-uppercase text-secondary fw-semibold" style={{ fontSize: 12 }}>
                          Party & Votes
                        </div>
                        <div className="mt-2 d-flex align-items-center gap-2">
                          <span style={{ width: 10, height: 10, borderRadius: 999, background: PARTY_COLORS[selectedFeature.properties?.party_key] || PARTY_COLORS.others, display: 'inline-block' }} />
                          <span className="fw-semibold">{selectedFeature.properties?.party_label || 'N/A'}</span>
                        </div>
                        <div className="mt-3" style={{ fontSize: 13 }}>
                          <div>
                            Impeachment: <span className="fw-semibold">{selectedFeature.properties?.impeachment_label || 'N/A'}</span>
                          </div>
                          <div>
                            Budget 2024: <span className="fw-semibold">{selectedFeature.properties?.budget_label || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-secondary">Select a constituency on the map to view details.</div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedFeature(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const FilterSelect = ({ label, value, placeholder, onChange, options }) => (
  <div className="mb-3">
    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
    <select
      className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
)

const SummaryBlock = ({ summary, parties }) => (
  <section className="summery bg-white shadow-md rounded-lg p-3 mt-4">
    <h3 className="text-base font-semibold mb-3">Overview Summary</h3>
    <div className="grid grid-cols-1 gap-4">
      <SummaryCard title="Total Constituencies" value={summary.total} className="bg-blue-50" />
      <SummaryCard
        title="Registered Voters (filtered)"
        value={summary.registeredVoters ? formatNumber(summary.registeredVoters) : 'N/A'}
        className="bg-indigo-50"
      />

      <div className="bg-green-50 p-4 rounded-lg shadow-sm">
        <p className="text-sm text-green-700 font-medium">Parties</p>
        <div className="flex flex-wrap mt-2 gap-2">
          {parties.map((party) => (
            <span
              key={party.value}
              className={`px-2 py-1 rounded text-xs text-white ${PARTY_BADGE_KEYS.has(party.value) ? `party-${party.value}` : 'party-others'
                }`}
            >
              {party.label}: {summary.parties[party.value] || 0}
            </span>
          ))}
        </div>
      </div>

      <SummaryBreakdown title="Impeachment Votes" data={summary.impeachment} />
      {summary.budget && (
        <SummaryBreakdown title="2024 Budget Vote" data={summary.budget} colorMap={BUDGET_COLORS} />
      )}
    </div>


  </section>
)

const SummaryBreakdown = ({ title, data, colorMap = VOTE_COLORS }) => (
  <div className="bg-yellow-50 p-4 rounded-lg shadow-sm">
    <p className="text-sm text-yellow-700 font-medium">{title}</p>
    <div className="flex flex-wrap mt-2 gap-2">
      {VOTE_OPTIONS.map((vote) => (
        <span
          key={vote.key}
          className="px-2 py-1 rounded text-xs text-white"
          style={{ backgroundColor: colorMap[vote.key] || '#4b5563' }}
        >
          {vote.label}: {data?.[vote.key] || 0}
        </span>
      ))}
    </div>
  </div>
)

const MapLegend = ({ mode, parties, features, registeredVoterClassification }) => {
  const partyLegendSource = parties.length
    ? parties
    : Array.from(Object.keys(PARTY_COLORS)).map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }))

  const legendItems = useMemo(() => {
    if (mode === 'party') {
      return partyLegendSource.map((party) => ({
        key: party.value,
        label: party.label,
        title: PARTY_FULL_NAMES[party.value] || party.label,
        color: PARTY_COLORS[party.value] || PARTY_COLORS.others,
      }))
    }
    if (mode === 'impeachment') {
      return VOTE_OPTIONS.map((option) => ({
        label: `${option.label} vote`,
        color: VOTE_COLORS[option.key],
      }))
    }
    if (mode === 'budget') {
      return VOTE_OPTIONS.map((option) => ({
        label: `${option.label} budget vote`,
        color: BUDGET_COLORS[option.key],
      }))
    }
    if (mode === 'registered_voters' && registeredVoterClassification?.breaks?.length) {
      const { breaks, colors } = registeredVoterClassification
      return breaks.slice(0, -1).map((value, index) => ({
        label: `${formatThousandRounded(value)} – ${formatThousandRounded(
          breaks[index + 1],
        )} voters`,
        color: colors[index] || colors[colors.length - 1],
      }))
    }
    return []
  }, [mode, partyLegendSource, registeredVoterClassification])

  return (
    <div className="map-legend">
      <p className="map-legend__title">Legend</p>
      {mode === 'registered_voters' && !registeredVoterClassification?.breaks?.length ? (
        <p className="map-legend__note">Registered voter data unavailable for coloring.</p>
      ) : (
        <ul className="map-legend__list">
          {legendItems.map((item) => (
            <li key={item.key || item.label} className="map-legend__item">
              <span className="map-legend__swatch" style={{ backgroundColor: item.color }} />
              <span title={item.title || item.label}>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SummaryCard = ({ title, value, className }) => (
  <div className={`${className} p-4 rounded-lg shadow-sm`}>
    <p className="text-sm text-gray-700 font-medium">{title}</p>
    <p className="text-2xl font-bold mt-2">{value}</p>
  </div>
)

const DetailRow = ({ label, value }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs font-bold text-gray-800 flex-shrink-0">{label}:</span>
    <span className="text-xs text-gray-900 text-right flex-shrink-0 leading-tight">{value || 'N/A'}</span>
  </div>
)

const PopupContent = ({ feature, colorMode, position, formatNumber }) => {
  const props = feature.properties || {}
  const name = props.display_name || props.name || 'Unknown'

  let content = null

  if (colorMode === 'party') {
    content = (
      <>
        <div className="font-bold text-gray-900">{name}</div>
        <div className="font-bold text-gray-900">MP: {props.mp || 'N/A'}</div>
        <div className="font-bold text-gray-900">Party: {props.party_label || 'N/A'}</div>
      </>
    )
  } else if (colorMode === 'impeachment') {
    content = (
      <>
        <div className="font-bold text-gray-900">{name}</div>
        <div className="font-bold text-gray-900">Impeachment Vote: {props.impeachment_label || 'N/A'}</div>
        <div className="font-bold text-gray-900">MP: {props.mp || 'N/A'}</div>
      </>
    )
  } else if (colorMode === 'registered_voters') {
    content = (
      <>
        <div className="font-bold text-gray-900">{name}</div>
        <div className="font-bold text-gray-900">Registered Voters: {formatNumber(props.registered_voters)}</div>
      </>
    )
  } else if (colorMode === 'budget') {
    content = (
      <>
        <div className="font-bold text-gray-900">{name}</div>
        <div className="font-bold text-gray-900">Budget Vote: {props.budget_label || 'N/A'}</div>
        <div className="font-bold text-gray-900">MP: {props.mp || 'N/A'}</div>
      </>
    )
  } else {
    // Default fallback
    content = (
      <>
        <div className="font-bold text-gray-900">{name}</div>
        <div className="font-bold text-gray-900">MP: {props.mp || 'N/A'}</div>
      </>
    )
  }

  return (
    <div
      className="absolute z-[1000] border-2 border-gray-400 rounded shadow-lg p-2"
      style={{
        left: `${position.x + 15}px`,
        top: `${position.y - 10}px`,
        transform: 'translateY(-100%)',
        maxWidth: '180px',
        minWidth: '140px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => {
        // Keep popup open when hovering over it
        if (window.currentHoverTimeout) {
          clearTimeout(window.currentHoverTimeout)
        }
      }}
      onMouseLeave={() => {
        // Close popup with delay when leaving popup
        window.currentHoverTimeout = setTimeout(() => {
          setHoveredFeature(null)
        }, 200)
      }}
    >
      <div className="text-xs space-y-0.5">
        {content}
      </div>
    </div>
  )
}

const VoteBadge = ({ label, value }) => {
  const normalized = normalizeKey(value)
  const badgeClass = normalized ? `vote-${normalized}` : 'bg-gray-300'
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`font-semibold inline-block px-2 py-0.5 rounded text-xs text-white ${badgeClass}`}>
        {value || 'N/A'}
      </p>
    </div>
  )
}

const getStyleForFeature = (props = {}, mode, registeredVoterClassification) => {
  if (mode === 'impeachment') {
    return baseStyle(getVoteColor(props.impeachment_key))
  }
  if (mode === 'budget') {
    return baseStyle(getBudgetColor(props.budget_key))
  }
  if (mode === 'registered_voters') {
    return baseStyle(getRegisteredVoterColor(props.registered_voters, registeredVoterClassification))
  }
  return baseStyle(getPartyColor(props.party_key))
}

const baseStyle = (fillColor) => ({
  fillColor,
  weight: 1,
  opacity: 1,
  color: '#ffffff',
  fillOpacity: 0.7,
})

export default App
