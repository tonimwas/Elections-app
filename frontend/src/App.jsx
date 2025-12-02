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
  { key: 'election', label: '2024 Election' },
  { key: 'registered_voters', label: 'Registered Voters' },
]
const PARTY_COLORS = {
  jubilee: '#dc2626',
  uda: '#facc15',
  odm: '#2563eb',
  independent: '#6b7280',
  others: '#6b7280',
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
  yes: '#38a169',
  no: '#e53e3e',
  abstain: '#ecc94b',
}
const BUDGET_COLORS = {
  yes: '#2563eb',
  no: '#b91c1c',
  abstain: '#d97706',
}
const ELECTION_COLOR_PALETTE = ['#805ad5', '#dd6b20', '#3182ce', '#f56565', '#38b2ac', '#2b6cb0', '#d53f8c']
const PARTY_BADGE_KEYS = new Set(['jubilee', 'uda', 'odm', 'independent', 'others'])
const KENYA_BOUNDS = L.latLngBounds(
  [
    [-4.9, 33.5],
    [5.5, 42.1],
  ],
)
const MAP_PADDING = [20, 20]

const normalizeKey = (value = '') => value.toString().toLowerCase().trim()
const VOTE_OPTIONS = [
  { key: 'yes', label: 'YES' },
  { key: 'no', label: 'NO' },
  { key: 'abstain', label: 'ABSTAIN' },
]

const normalizeElectionResults = (results) => {
  if (!results || typeof results !== 'object') {
    return {}
  }
  return Object.entries(results).reduce((acc, [candidate, value]) => {
    const numeric = typeof value === 'number' ? value : parseFloat(value)
    acc[candidate] = Number.isFinite(numeric) ? numeric : 0
    return acc
  }, {})
}

const determineWinner = (results) => {
  const entries = Object.entries(results || {})
  if (!entries.length) {
    return null
  }
  return entries.reduce(
    (top, current) => (current[1] > top[1] ? current : top),
    entries[0],
  )[0]
}

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

function useElectionColors() {
  const cacheRef = useRef({})
  const paletteIndexRef = useRef(0)

  return (candidate) => {
    const key = normalizeKey(candidate)
    if (!key) {
      return '#a0aec0'
    }
    if (!cacheRef.current[key]) {
      cacheRef.current[key] =
        ELECTION_COLOR_PALETTE[paletteIndexRef.current % ELECTION_COLOR_PALETTE.length]
      paletteIndexRef.current += 1
    }
    return cacheRef.current[key]
  }
}

const defaultFilters = {
  county: '',
  party: '',
  impeachment: '',
  electionCandidate: '',
}

function App() {
  const [features, setFeatures] = useState([])
  const [filters, setFilters] = useState(defaultFilters)
  const [colorMode, setColorMode] = useState('party')
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const geoJsonLayerRef = useRef(null)
  const detailMapContainerRef = useRef(null)
  const detailMapRef = useRef(null)
  const detailLayerRef = useRef(null)
  const getElectionColor = useElectionColors()

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
          const partyKey = normalizeKey(partyLabel) || 'others'
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
              party_key: PARTY_BADGE_KEYS.has(partyKey) ? partyKey : 'others',
              impeachment_label: impeachmentLabel,
              impeachment_key: impeachmentKey,
              budget_label: budgetLabel,
              budget_key: budgetKey,
              election_results: normalizeElectionResults(properties.election_results),
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
      maxBounds: KENYA_BOUNDS,
      maxBoundsViscosity: 1.0,
      maxZoom: 19,
      minZoom: DEFAULT_ZOOM,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current)
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

  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      const props = feature.properties || {}
      if (filters.county && normalizeKey(props.county) !== normalizeKey(filters.county)) {
        return false
      }
      if (filters.party && props.party_key !== normalizeKey(filters.party)) {
        return false
      }
      if (
        filters.impeachment &&
        normalizeKey(props.impeachment_label) !== normalizeKey(filters.impeachment)
      ) {
        return false
      }
      if (filters.electionCandidate) {
        const target = normalizeKey(filters.electionCandidate)
        const hasCandidate = Object.keys(props.election_results || {}).some(
          (candidate) => normalizeKey(candidate) === target,
        )
        if (!hasCandidate) {
          return false
        }
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
      electionWins: {},
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

      const winner = determineWinner(props.election_results)
      if (winner) {
        const key = normalizeKey(winner)
        totals.electionWins[key] = (totals.electionWins[key] || 0) + 1
      }

      const voters = Number(props.registered_voters)
      if (Number.isFinite(voters)) {
        totals.registeredVoters += voters
      }
    })

    const electionLeader = Object.entries(totals.electionWins).sort((a, b) => b[1] - a[1])[0]
    return {
      ...totals,
      leadingCandidate: electionLeader ? electionLeader[0] : null,
      leadingShare: electionLeader && totals.total
        ? Math.round((electionLeader[1] / totals.total) * 100)
        : 0,
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

  const candidates = useMemo(() => {
    const names = new Set()
    features.forEach((feature) => {
      Object.keys(feature.properties?.election_results || {}).forEach((candidate) => {
        names.add(candidate)
      })
    })
    return Array.from(names).sort()
  }, [features])

  useEffect(() => {
    if (!mapRef.current) {
      return
    }
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.remove()
    }
    if (!filteredFeatures.length) {
      geoJsonLayerRef.current = null
      return
    }

    const layer = L.geoJSON(filteredFeatures, {
      style: (feature) =>
        getStyleForFeature(
          feature.properties,
          colorMode,
          getElectionColor,
          registeredVoterClassification,
        ),
      onEachFeature: (feature, layerInstance) => {
        const props = feature.properties || {}
        const tooltipContent = `
          <div class="tooltip">
            <div class="font-semibold text-xs">${props.name || 'Unknown'}</div>
            <div class="text-[11px]">MP: ${props.mp || 'N/A'}</div>
            <div class="text-[11px]">Party: ${props.party_label || 'N/A'}</div>
          </div>
        `
        layerInstance.bindTooltip(tooltipContent, {
          sticky: false,
          direction: 'auto',
          opacity: 0.9,
        })
        layerInstance.on('mouseover', () => {
          layerInstance.openTooltip()
        })
        layerInstance.on('mouseout', () => {
          layerInstance.closeTooltip()
        })
        layerInstance.on('click', () => {
          setSelectedFeature(feature)
        })
      },
    })

    geoJsonLayerRef.current = layer.addTo(mapRef.current)
  }, [filteredFeatures, colorMode, getElectionColor, registeredVoterClassification])

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleResetFilters = () => {
    setFilters(defaultFilters)
  }

  const handleColorModeChange = (mode) => {
    setColorMode(mode)
  }

  const handleResetMapView = () => {
    if (!mapRef.current) {
      return
    }
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

  const detailedElectionEntries = useMemo(() => {
    if (!selectedFeature) {
      return []
    }
    return Object.entries(selectedFeature.properties?.election_results || {})
      .sort((a, b) => b[1] - a[1])
  }, [selectedFeature])

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
            Kenya Constituency Election Visualization
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
        <aside className="hidden md:block w-64 bg-white shadow-md p-3 overflow-y-auto">
          <h2 className="text-base font-semibold mb-3 pb-2 border-b border-gray-200">Filters</h2>

          <div className="filter space-y-4">
            <FilterSelect
              label="County"
              value={filters.county}
              placeholder="All Counties"
              onChange={(value) => handleFilterChange('county', value)}
              options={counties.map((county) => ({ value: county, label: county }))}
            />

            <FilterSelect
              label="Party"
              value={filters.party}
              placeholder="All Parties"
              onChange={(value) => handleFilterChange('party', value)}
              options={parties}
            />

            <FilterSelect
              label="Impeachment Vote"
              value={filters.impeachment}
              placeholder="All Votes"
              onChange={(value) => handleFilterChange('impeachment', value)}
              options={['Yes', 'No', 'Abstain'].map((label) => ({ value: label, label }))}
            />

            <FilterSelect
              label="2024 Election Candidate"
              value={filters.electionCandidate}
              placeholder="All Candidates"
              onChange={(value) => handleFilterChange('electionCandidate', value)}
              options={candidates.map((candidate) => ({ value: candidate, label: candidate }))}
            />

            <button
              type="button"
              className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300 transition"
              onClick={handleResetFilters}
            >
              Reset All Filters
            </button>
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
            <h2 className="text-base font-semibold">Filters</h2>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setMobileFiltersOpen(false)}
            >
              <FaTimes />
            </button>
          </div>

          <div className="filter space-y-4">
            <FilterSelect
              label="County"
              value={filters.county}
              placeholder="All Counties"
              onChange={(value) => handleFilterChange('county', value)}
              options={counties.map((county) => ({ value: county, label: county }))}
            />

            <FilterSelect
              label="Party"
              value={filters.party}
              placeholder="All Parties"
              onChange={(value) => handleFilterChange('party', value)}
              options={parties}
            />

            <FilterSelect
              label="Impeachment Vote"
              value={filters.impeachment}
              placeholder="All Votes"
              onChange={(value) => handleFilterChange('impeachment', value)}
              options={['Yes', 'No', 'Abstain'].map((label) => ({ value: label, label }))}
            />

            <FilterSelect
              label="2024 Election Candidate"
              value={filters.electionCandidate}
              placeholder="All Candidates"
              onChange={(value) => handleFilterChange('electionCandidate', value)}
              options={candidates.map((candidate) => ({ value: candidate, label: candidate }))}
            />

            <div className="flex space-x-2">
              <button
                type="button"
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md"
                onClick={() => setMobileFiltersOpen(false)}
              >
                Apply
              </button>
              <button
                type="button"
                className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-md"
                onClick={handleResetFilters}
              >
                Reset
              </button>
            </div>
          </div>

          <SummaryBlock summary={summary} parties={parties} />
        </div>

        <div className="flex-1 flex flex-col">
          <section className="flex-1 ml-2 mr-4 mb-4 bg-white rounded-lg shadow-md">
            <div className="map-pane">
              <div className="map-pane__actions">
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

              <div className="map-frame">
                <MapLegend
                  mode={colorMode}
                  parties={parties}
                  features={features}
                  getElectionColor={getElectionColor}
                  registeredVoterClassification={registeredVoterClassification}
                />
                <div ref={mapContainerRef} className="map-canvas" />
              </div>
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
          </section>
        </div>

        <aside
          className={`${selectedFeature ? 'block' : 'hidden'} w-80 bg-white shadow-md p-3 overflow-y-auto`}
        >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
            <h2 className="text-base font-semibold">Constituency Detail</h2>
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700"
              onClick={() => setSelectedFeature(null)}
            >
              <FaTimes />
            </button>
          </div>

          {selectedFeature ? (
            <div className="space-y-2 text-sm">
              <div ref={detailMapContainerRef} className="mb-3 h-40 bg-gray-100 rounded-lg" />

              <DetailRow
                label="Constituency"
                value={selectedFeature.properties?.display_name || selectedFeature.properties?.name}
              />
              {selectedFeature.properties?.updated_name &&
                selectedFeature.properties?.updated_name !== selectedFeature.properties?.name && (
                  <DetailRow label="Original Name" value={selectedFeature.properties?.name} />
                )}
              <DetailRow label="County" value={selectedFeature.properties?.county} />
              <DetailRow label="Member of Parliament" value={selectedFeature.properties?.mp} />
              <DetailRow
                label="Registered Voters"
                value={formatNumber(selectedFeature.properties?.registered_voters)}
              />

              <div className="space-y-1">
                <p className="text-xs text-gray-500">Party</p>
                <p className="font-medium flex items-center space-x-2 text-sm">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs text-white ${detailPartyClass}`}>
                    {selectedFeature.properties?.party_label}
                  </span>
                  <span>{selectedFeature.properties?.party_label}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <VoteBadge
                  label="Impeachment Vote"
                  value={selectedFeature.properties?.impeachment_label}
                />
                <VoteBadge label="Budget Vote" value={selectedFeature.properties?.budget_label} />
              </div>

              <div className="space-y-1">
                <p className="text-xs text-gray-500">2024 Election Results</p>
                <div className="space-y-1.5">
                  {detailedElectionEntries.length ? (
                    detailedElectionEntries.map(([candidate, percentage]) => (
                      <div key={candidate} className="text-xs">
                        <div className="flex justify-between">
                          <span>{candidate}</span>
                          <span className="font-medium">{percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: getElectionColor(candidate),
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No election data available</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Select a constituency on the map to see details.</p>
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
              <p>This application visualizes Kenya's constituency election data using interactive maps.</p>
              <div>
                <h3 className="font-semibold">Features</h3>
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Color constituencies by party, impeachment vote, or 2024 election results</li>
                  <li>Filter by county, party, impeachment vote, or election candidate</li>
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

      <div className="bg-purple-50 p-4 rounded-lg shadow-sm">
        <p className="text-sm text-purple-700 font-medium">2024 Election</p>
        <p className="text-sm mt-2">
          Winner: <span className="font-bold">{summary.leadingCandidate || 'N/A'}</span>
        </p>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
          <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${summary.leadingShare}%` }} />
        </div>
        <p className="text-xs text-right mt-1">{summary.leadingShare}% of constituencies</p>
      </div>
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

const MapLegend = ({ mode, parties, features, getElectionColor, registeredVoterClassification }) => {
  const partyLegendSource = parties.length
    ? parties
    : Array.from(Object.keys(PARTY_COLORS)).map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }))

  const electionItems = useMemo(() => {
    if (mode !== 'election') {
      return []
    }
    const seen = new Map()
    features.forEach((feature) => {
      Object.keys(feature.properties?.election_results || {}).forEach((candidate) => {
        if (!seen.has(candidate)) {
          seen.set(candidate, getElectionColor(candidate))
        }
      })
    })
    return Array.from(seen.entries())
      .slice(0, 8)
      .map(([label, color]) => ({ label, color }))
  }, [mode, features, getElectionColor])

  const legendItems = useMemo(() => {
    if (mode === 'party') {
      return partyLegendSource.map((party) => ({
        label: party.label,
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
    if (mode === 'election') {
      return electionItems.length
        ? electionItems
        : [
          {
            label: 'Leading candidate per constituency',
            color: '#7c3aed',
          },
        ]
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
  }, [mode, partyLegendSource, electionItems, registeredVoterClassification])

  return (
    <div className="map-legend">
      <p className="map-legend__title">Legend</p>
      {mode === 'election' && !electionItems.length ? (
        <p className="map-legend__note">
          Color shows the leading 2024 candidate per constituency. Candidates appear once data loads.
        </p>
      ) : mode === 'registered_voters' && !registeredVoterClassification?.breaks?.length ? (
        <p className="map-legend__note">Registered voter data unavailable for coloring.</p>
      ) : (
        <ul className="map-legend__list">
          {legendItems.map((item) => (
            <li key={item.label} className="map-legend__item">
              <span className="map-legend__swatch" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
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
  <div>
    <p className="text-sm text-gray-500">{label}</p>
    <p className="font-semibold">{value || 'N/A'}</p>
  </div>
)

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

const getStyleForFeature = (props = {}, mode, getElectionColor, registeredVoterClassification) => {
  if (mode === 'impeachment') {
    return baseStyle(getVoteColor(props.impeachment_key))
  }
  if (mode === 'budget') {
    return baseStyle(getBudgetColor(props.budget_key))
  }
  if (mode === 'election') {
    const winner = determineWinner(props.election_results)
    return baseStyle(getElectionColor(winner))
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
