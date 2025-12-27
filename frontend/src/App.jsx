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
  yes: '#e53e3e',
  no: '#38a169',
  abstain: '#ecc94b',
}
const BUDGET_COLORS = {
  yes: '#2563eb',
  no: '#b91c1c',
  abstain: '#d97706',
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
  const [activeFilterTypes, setActiveFilterTypes] = useState([])
  const [newFilterType, setNewFilterType] = useState('')
  const [colorMode, setColorMode] = useState('party')
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [hoveredFeature, setHoveredFeature] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [expandedFilters, setExpandedFilters] = useState({})

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const detailMapContainerRef = useRef(null)
  const detailMapRef = useRef(null)
  const detailLayerRef = useRef(null)
  const selectedLayerRef = useRef(null)

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

  useEffect(() => {
    if (!selectedFeature || !detailMapContainerRef.current) {
      return
    }
    if (!detailMapRef.current) {
      detailMapRef.current = L.map(detailMapContainerRef.current).setView(DEFAULT_CENTER, 10)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(detailMapRef.current)
    }
    if (detailLayerRef.current) {
      detailLayerRef.current.remove()
    }
    detailLayerRef.current = L.geoJSON(selectedFeature, {
      style: {
        fillColor: '#4299e1',
        weight: 2,
        opacity: 1,
        color: '#2b6cb0',
        fillOpacity: 0.6,
      },
    }).addTo(detailMapRef.current)
    const bounds = detailLayerRef.current.getBounds()
    if (bounds.isValid()) {
      detailMapRef.current.fitBounds(bounds, { padding: [10, 10] })
    }
    setTimeout(() => {
      detailMapRef.current?.invalidateSize()
    }, 100)
  }, [selectedFeature])

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
          let hoverTimeout = null

          layerInstance.on('mouseover', (e) => {
            if (hoverTimeout) clearTimeout(hoverTimeout)
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
            // Small delay to prevent flickering
            hoverTimeout = setTimeout(() => {
              setHoveredFeature(null)
            }, 100)
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

  const handleFilterTypeSelect = (filterType) => {
    if (filterType && !activeFilterTypes.includes(filterType)) {
      setActiveFilterTypes((prev) => [...prev, filterType])
      setNewFilterType('')
    }
  }

  const handleRemoveFilter = (filterType) => {
    setActiveFilterTypes((prev) => prev.filter((type) => type !== filterType))
    setFilters((prev) => ({ ...prev, [filterType]: [] }))
  }

  const handleResetFilters = () => {
    setFilters(defaultFilters)
    setActiveFilterTypes([])
    setNewFilterType('')
  }

  const availableFilterTypes = FILTER_TYPES.filter(
    (type) => !activeFilterTypes.includes(type.key)
  )

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

  const detailPartyClass = selectedFeature
    ? PARTY_BADGE_KEYS.has(selectedFeature.properties?.party_key)
      ? `party-${selectedFeature.properties.party_key}`
      : 'party-others'
    : ''

  return (
    <div className="bg-gray-100 min-h-screen flex flex-col">
      <header className="bg-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-800">
            Kenya Constituency Visualization
          </h1>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              className="md:hidden flex items-center justify-center bg-blue-600 text-white px-3 py-2 rounded-md"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <FaFilter className="mr-2" /> Filters
            </button>
            <button
              type="button"
              className="flex items-center justify-center bg-gray-200 text-gray-700 px-3 py-2 rounded-md"
              onClick={() => setAboutOpen(true)}
            >
              <FaInfoCircle className="mr-2" /> About
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="hidden md:block w-64 bg-white shadow-sm p-4 overflow-y-auto border-r border-gray-200">
          <div className="filter space-y-4">
            {activeFilterTypes.length > 0 && (
              <div className="space-y-2">
                {activeFilterTypes.map((filterType) => {
                  const filterConfig = FILTER_TYPES.find((f) => f.key === filterType)
                  let options = []
                  let placeholder = ''

                  if (filterType === 'county') {
                    options = counties.map((county) => ({ value: county, label: county }))
                    placeholder = 'All Counties'
                  } else if (filterType === 'party') {
                    options = parties
                    placeholder = 'All Parties'
                  } else if (filterType === 'impeachment') {
                    options = ['Yes', 'No', 'Abstain'].map((label) => ({ value: label, label }))
                    placeholder = 'All Votes'
                  }

                  const selectedValues = filters[filterType] || []
                  const isExpanded = !!expandedFilters[filterType]
                  const selectedCount = selectedValues.length

                  return (
                    <div
                      key={filterType}
                      className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
                      onMouseLeave={() => {
                        setExpandedFilters((prev) => ({ ...prev, [filterType]: false }))
                      }}
                    >
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setExpandedFilters((prev) => ({
                            ...prev,
                            [filterType]: !prev[filterType],
                          }))
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-semibold text-gray-700 cursor-pointer">
                            {filterConfig?.label || filterType}
                          </label>
                          {selectedCount > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              {selectedCount}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={isExpanded ? 'Collapse filter' : 'Expand filter'}
                          aria-expanded={isExpanded}
                          className="p-2 -m-2 rounded hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedFilters((prev) => ({
                              ...prev,
                              [filterType]: !prev[filterType],
                            }))
                          }}
                        >
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {/* Selected items (chips) shown above dropdown options so remove buttons stay accessible */}
                      {selectedValues.length > 0 && (
                        <div className="px-3 pb-2 border-t border-gray-100">
                          <div className="flex flex-wrap gap-1.5 pt-2">
                            {selectedValues.map((value) => {
                              const option = options.find((opt) => opt.value === value)
                              return (
                                <span
                                  key={value}
                                  className="inline-flex items-center space-x-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium"
                                >
                                  <span>{option?.label || value}</span>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${(option?.label || value).toString()}`}
                                    className="hover:bg-blue-200 rounded-full p-1 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleFilterValueToggle(filterType, value)
                                    }}
                                    title="Remove"
                                  >
                                    <FaTimes className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                          {options.map((option) => {
                            const isSelected = selectedValues.includes(option.value)
                            return (
                              <label
                                key={option.value}
                                className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 px-3 py-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleFilterValueToggle(filterType, option.value)
                                  setExpandedFilters((prev) => ({ ...prev, [filterType]: false }))
                                }}
                              >
                                <div className="relative flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  {isSelected && (
                                    <svg
                                      className="absolute w-3 h-3 text-white pointer-events-none"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-sm text-gray-700 flex-1">{option.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {availableFilterTypes.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter by</label>
                <select
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  value={newFilterType}
                  onChange={(e) => {
                    const selectedType = e.target.value
                    if (selectedType) {
                      handleFilterTypeSelect(selectedType)
                    }
                  }}
                >
                  <option value="">Select filter type...</option>
                  {availableFilterTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeFilterTypes.length > 0 && (
              <button
                type="button"
                className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm"
                onClick={handleResetFilters}
              >
                Reset All Filters
              </button>
            )}
          </div>

          <SummaryBlock summary={summary} parties={parties} />
        </aside>

        <div className={`left-panel ${mobileFiltersOpen ? 'open' : ''}`}>
          <div className="color-mode-card mt-6 mb-6">
            <div className="color-mode-card__header">
              <div>
                <p className="text-sm font-semibold text-gray-800">Color Map By</p>
                <p className="text-xs text-gray-500">Choose data layer</p>
              </div>
            </div>
            <div className="color-mode-card__options">
              {COLOR_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`color-mode-button ${colorMode === mode.key ? 'is-active' : ''}`}
                  onClick={() => handleColorModeChange(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center mb-3">
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setMobileFiltersOpen(false)}
            >
              <FaTimes />
            </button>
          </div>

          <div className="filter space-y-4">
            {activeFilterTypes.length > 0 && (
              <div className="space-y-2">
                {activeFilterTypes.map((filterType) => {
                  const filterConfig = FILTER_TYPES.find((f) => f.key === filterType)
                  let options = []
                  let placeholder = ''

                  if (filterType === 'county') {
                    options = counties.map((county) => ({ value: county, label: county }))
                    placeholder = 'All Counties'
                  } else if (filterType === 'party') {
                    options = parties
                    placeholder = 'All Parties'
                  } else if (filterType === 'impeachment') {
                    options = ['Yes', 'No', 'Abstain'].map((label) => ({ value: label, label }))
                    placeholder = 'All Votes'
                  }

                  const selectedValues = filters[filterType] || []
                  const isExpanded = !!expandedFilters[filterType]
                  const selectedCount = selectedValues.length

                  return (
                    <div
                      key={filterType}
                      className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden"
                      onMouseLeave={() => {
                        setExpandedFilters((prev) => ({ ...prev, [filterType]: false }))
                      }}
                    >
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setExpandedFilters((prev) => ({
                            ...prev,
                            [filterType]: !prev[filterType],
                          }))
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-semibold text-gray-700 cursor-pointer">
                            {filterConfig?.label || filterType}
                          </label>
                          {selectedCount > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              {selectedCount}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={isExpanded ? 'Collapse filter' : 'Expand filter'}
                          aria-expanded={isExpanded}
                          className="p-2 -m-2 rounded hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedFilters((prev) => ({
                              ...prev,
                              [filterType]: !prev[filterType],
                            }))
                          }}
                        >
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {/* Selected items (chips) shown above dropdown options so remove buttons stay accessible */}
                      {selectedValues.length > 0 && (
                        <div className="px-3 pb-2 border-t border-gray-100">
                          <div className="flex flex-wrap gap-1.5 pt-2">
                            {selectedValues.map((value) => {
                              const option = options.find((opt) => opt.value === value)
                              return (
                                <span
                                  key={value}
                                  className="inline-flex items-center space-x-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium"
                                >
                                  <span>{option?.label || value}</span>
                                  <button
                                    type="button"
                                    aria-label={`Remove ${(option?.label || value).toString()}`}
                                    className="hover:bg-blue-200 rounded-full p-1 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleFilterValueToggle(filterType, value)
                                    }}
                                    title="Remove"
                                  >
                                    <FaTimes className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="max-h-64 overflow-y-auto border-t border-gray-100">
                          {options.map((option) => {
                            const isSelected = selectedValues.includes(option.value)
                            return (
                              <label
                                key={option.value}
                                className="flex items-center space-x-2 cursor-pointer hover:bg-blue-50 px-3 py-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleFilterValueToggle(filterType, option.value)
                                  setExpandedFilters((prev) => ({ ...prev, [filterType]: false }))
                                }}
                              >
                                <div className="relative flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  {isSelected && (
                                    <svg
                                      className="absolute w-3 h-3 text-white pointer-events-none"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-sm text-gray-700 flex-1">{option.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {availableFilterTypes.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter by</label>
                <select
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  value={newFilterType}
                  onChange={(e) => {
                    const selectedType = e.target.value
                    if (selectedType) {
                      handleFilterTypeSelect(selectedType)
                    }
                  }}
                >
                  <option value="">Select filter type...</option>
                  {availableFilterTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex space-x-2">
              <button
                type="button"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md"
                onClick={() => setMobileFiltersOpen(false)}
              >
                Apply
              </button>
              {activeFilterTypes.length > 0 && (
                <button
                  type="button"
                  className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md"
                  onClick={handleResetFilters}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <SummaryBlock summary={summary} parties={parties} />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <section className="flex-1 m-4 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="map-pane h-full flex flex-col">
              <div className="map-pane__actions flex-shrink-0">
                <button
                  type="button"
                  className="bg-white/95 text-sm font-medium text-gray-800 px-3 py-2 rounded shadow hover:bg-white"
                  onClick={handleResetMapView}
                >
                  Reset map extent
                </button>
                {selectedFeature && (
                  <button
                    type="button"
                    className="bg-white/95 text-sm font-medium text-gray-800 px-3 py-2 rounded shadow hover:bg-white"
                    onClick={handleZoomToSelected}
                  >
                    {`Zoom to extent of "${selectedFeature.properties?.display_name ||
                      selectedFeature.properties?.name ||
                      'Constituency'
                      }"`}
                  </button>
                )}
              </div>

              <div className="map-frame relative overflow-hidden">
                <div className="relative h-full w-full">
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
                <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-lg">
                  {loading ? (
                    <div className="flex items-center space-x-3">
                      <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12" />
                      <p className="text-gray-700">Loading map data...</p>
                    </div>
                  ) : (
                    <p className="text-red-600 font-medium">{error}</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside
          className={`${selectedFeature ? 'block' : 'hidden'} w-80 bg-gradient-to-b from-white to-gray-50 shadow-lg border-l border-gray-200 overflow-y-auto`}
        >
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-gray-900">Constituency Detail</h2>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 transition-colors"
                onClick={() => setSelectedFeature(null)}
              >
                <FaTimes className="text-sm" />
              </button>
            </div>
          </div>

          {selectedFeature ? (
            <div className="px-4 py-3 space-y-2.5 text-xs font-sans">
              <div ref={detailMapContainerRef} className="mb-3 h-32 bg-gray-100 rounded-lg" />

              <DetailRow
                label="Constituency"
                value={selectedFeature.properties?.display_name || selectedFeature.properties?.name}
              />
              {selectedFeature.properties?.updated_name &&
                selectedFeature.properties?.updated_name !== selectedFeature.properties?.name && (
                  <DetailRow label="Original Name" value={selectedFeature.properties?.name} />
                )}
              <DetailRow label="County" value={selectedFeature.properties?.county} />
              <DetailRow label="Registered Voters" value={formatNumber(selectedFeature.properties?.registered_voters)} />

              <div className="space-y-2 pt-2 border-t border-gray-200">
                <DetailRow
                  label="Member of Parliament"
                  value={selectedFeature.properties?.mp}
                />

                <div className="space-y-2">
                  <DetailRow
                    label="Party"
                    value={
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs text-white ${detailPartyClass}`}
                      >
                        {selectedFeature.properties?.party_label}
                      </span>
                    }
                  />

                  <div className="space-y-1.5 bg-gray-50 p-2 rounded-lg">
                    <DetailRow
                      label="Impeachment Vote"
                      value={
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs text-white vote-${normalizeKey(
                            selectedFeature.properties?.impeachment_label
                          )}`}
                        >
                          {selectedFeature.properties?.impeachment_label || 'N/A'}
                        </span>
                      }
                    />
                    <DetailRow
                      label="Budget Vote"
                      value={
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs text-white vote-${normalizeKey(
                            selectedFeature.properties?.budget_label
                          )}`}
                        >
                          {selectedFeature.properties?.budget_label || 'N/A'}
                        </span>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 px-4 py-3">Select a constituency on the map to see details.</p>
          )}
        </aside>
      </main>

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
      className="absolute z-[1000] border-2 border-gray-400 rounded shadow-lg p-2 pointer-events-none"
      style={{
        left: `${position.x + 15}px`,
        top: `${position.y - 10}px`,
        transform: 'translateY(-100%)',
        maxWidth: '180px',
        minWidth: '140px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)',
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
