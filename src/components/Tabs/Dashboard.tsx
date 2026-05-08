import React, { useState, useEffect } from 'react';
import { Target, Search, Compass, ShieldCheck, Loader2, ArrowRight, RefreshCw, Sparkles, Share2, FileText } from 'lucide-react';
import { UserProfile } from '../../types';
import { matchScoutProtocol, loadFeed, loadMoreFeed, generateApplyAssist } from '../../services/geminiService';
import ShareModal from '../ui/ShareModal';
import ApplyAssistModal from '../ui/ApplyAssistModal';

interface DashboardProps {
  user: any;
  profile: UserProfile | null;
}

export default function Dashboard({ user, profile }: DashboardProps) {
  const [showScoutModal, setShowScoutModal] = useState(false);
  const [scoutStep, setScoutStep] = useState(1);
  const [scoutData, setScoutData] = useState({ year: '', field: '', tech: '', goal: '' });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [shareOpp, setShareOpp] = useState<{title: string, link: string} | null>(null);
  const [discoveryMode, setDiscoveryMode] = useState<'smart' | 'explore'>('smart');

  const [isAssistModalOpen, setIsAssistModalOpen] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistContent, setAssistContent] = useState<string | null>(null);
  const [assistingOpp, setAssistingOpp] = useState<any>(null);

  const [hasNewUpdates, setHasNewUpdates] = useState(false);
  const [newLiveItems, setNewLiveItems] = useState<any[]>([]);

  useEffect(() => {
    if (user && profile) {
      loadInitialFeed(false, discoveryMode);
      
      // Auto-refresh check every 5 minutes
      const interval = setInterval(() => {
        loadInitialFeed(false, discoveryMode);
      }, 300000);

      // Simulate live background updates (polling for new opportunities)
      const liveUpdateInterval = setInterval(() => {
        if (!loading && !loadingMore && feedItems.length > 0) {
          // Fake 30% chance every 15 seconds to find a new live opportunity
          if (Math.random() > 0.70) {
            const simulatedLiveOpp = {
              title: `Live Discovery: ${Math.random() > 0.5 ? 'Global' : 'Virtual'} Hackathon ${Math.floor(Math.random() * 1000)}`,
              org: "Yuvahub Live Network",
              type: "hackathon",
              deadline: "5 days",
              description: "A newly discovered hackathon automatically injected into your smart feed based on your interests.",
              tags: profile.skills?.slice(0, 2) || ["Tech", "Coding"],
              matchReason: "Live match based on your real-time profile activity.",
              isNew: true,
              isLive: true,
              applyLink: "https://yuvahub.xyz"
            };
            setNewLiveItems(prev => [simulatedLiveOpp, ...prev]);
            setHasNewUpdates(true);
          }
        }
      }, 15000);
      
      // Also refresh on window focus
      const handleFocus = () => loadInitialFeed(false, discoveryMode);
      window.addEventListener('focus', handleFocus);
      
      return () => {
        clearInterval(interval);
        clearInterval(liveUpdateInterval);
        window.removeEventListener('focus', handleFocus);
      };
    }
  }, [user, profile, discoveryMode, feedItems.length, loading, loadingMore]);

  const loadInitialFeed = async (force = false, mode = discoveryMode) => {
    // Only show full loading spinner for first load or force refresh
    const isFirstLoad = feedItems.length === 0;
    if (isFirstLoad || force) setLoading(true);
    
    try {
      const results = await loadFeed({ ...profile, uid: user.uid, discoveryMode: mode }, force);
      setFeedItems(results || []);
      setLastUpdated(Date.now());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (loadingMore || !profile || !user) return;
    setLoadingMore(true);
    try {
      const results = await loadMoreFeed({ ...profile, uid: user.uid, discoveryMode }, feedItems);
      setFeedItems(results);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const profileStrength = () => {
    if (!profile) return 0;
    const fields = [profile.year, profile.field, profile.college, profile.skills?.length];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / 4) * 100);
  };

  const handleScoutSubmit = async (finalData: any) => {
    setLoading(true);
    setShowScoutModal(false);
    
    try {
      const results = await matchScoutProtocol(profile, finalData);
      setFeedItems(results.results ? results.results : (Array.isArray(results) ? results : []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setScoutStep(1); // reset for next time
    }
  };

  const handleApplyAssist = async (opp: any) => {
    setAssistingOpp(opp);
    setAssistContent(null);
    setIsAssistModalOpen(true);
    setAssistLoading(true);
    
    try {
      const result = await generateApplyAssist({
        title: opp.title,
        organization: opp.org || opp.organization
      }, profile);
      setAssistContent(result);
    } catch (e) {
      console.error(e);
      setAssistContent("Failed to generate application assistant draft. Please try again.");
    } finally {
      setAssistLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto space-y-12">
        <header>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-gray-900">
            Welcome to <span className="text-blue-600">YuvaHub</span>.
          </h2>
          <p className="text-sm font-medium text-gray-500">Please log in to access your personalized feed and scout protocol.</p>
        </header>
        <div className="clean-card p-12 text-center border-dashed border-gray-300">
          <ShieldCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h3>
          <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">You must verify your identity to access the intelligence network.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 relative">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          Dashboard
        </h2>
        <p className="text-gray-500 mt-1">Here is your intelligence briefing.</p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Opportunities Matched" value={feedItems.length > 0 ? feedItems.length : "0"} icon={Target} />
        <MetricCard title="Applications Tracked" value="0" icon={Compass} />
        <MetricCard title="Mentor Sessions" value="0" icon={Search} />
        <MetricCard title="Profile Strength" value={`${profileStrength()}%`} icon={ShieldCheck} highlight />
      </div>

      {/* Scout Protocol Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-bold text-blue-900 mb-2">Scout Protocol</h3>
          <p className="text-blue-700 max-w-xl">Find your best matches in 60 seconds. Our AI will calibrate your feed based on your specific requirements and background.</p>
          <div className="flex items-center gap-4 mt-6 text-sm font-medium text-blue-800">
            <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">1</span> Year</span>
            <ArrowRight className="w-3 h-3 text-blue-300" />
            <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">2</span> Field</span>
            <ArrowRight className="w-3 h-3 text-blue-300" />
            <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">3</span> Tech</span>
            <ArrowRight className="w-3 h-3 text-blue-300" />
            <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs">4</span> Goal</span>
          </div>
        </div>
        <button onClick={() => setShowScoutModal(true)} className="clean-btn px-8 py-3 whitespace-nowrap shadow-md hover:shadow-lg">
          Run Scout Protocol
        </button>
      </div>

      {/* Feed Preview */}
      <div className="space-y-4 pt-6 text-gray-900 border-t border-gray-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">Personalized Feed</h3>
            {lastUpdated && !loading && (
              <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                Last checked: {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Discovery Mode Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-full relative">
              <div 
                className={`absolute inset-y-1 w-[120px] rounded-full bg-white shadow-sm transition-all duration-300 ease-out`}
                style={{ left: discoveryMode === 'smart' ? '4px' : 'calc(100% - 124px)' }}
              />
              <button
                onClick={() => setDiscoveryMode('smart')}
                className={`relative w-[120px] z-10 flex items-center justify-center gap-2 py-1.5 px-3 rounded-full text-xs font-bold transition-colors ${discoveryMode === 'smart' ? 'text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Smart Match
              </button>
              <button
                onClick={() => setDiscoveryMode('explore')}
                className={`relative w-[120px] z-10 flex items-center justify-center gap-2 py-1.5 px-3 rounded-full text-xs font-bold transition-colors ${discoveryMode === 'explore' ? 'text-purple-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Compass className="w-3.5 h-3.5" />
                Explore
              </button>
            </div>

            <button 
              onClick={() => loadInitialFeed(true)}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 clean-card">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-500 font-medium text-sm">Processing parameters via Gemini...</p>
          </div>
        ) : feedItems.length > 0 || newLiveItems.length > 0 ? (
          <div className="space-y-8 relative">

            {/* Live Update Pill */}
            {hasNewUpdates && (
              <div className="sticky top-4 z-40 flex justify-center w-full">
                <button
                  onClick={() => {
                    setFeedItems(prev => [...newLiveItems, ...prev]);
                    setNewLiveItems([]);
                    setHasNewUpdates(false);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-full px-6 py-2.5 text-sm font-bold flex items-center gap-2 transition-transform hover:scale-105"
                >
                  ↑ {newLiveItems.length} New {newLiveItems.length === 1 ? 'Opportunity' : 'Opportunities'}
                </button>
              </div>
            )}

            {([
              { title: "New Today", icon: <Sparkles className="w-5 h-5 text-amber-500" />, items: feedItems.filter(i => i.isNew) },
              { title: "Previously Seen", icon: <Compass className="w-5 h-5 text-gray-400" />, items: feedItems.filter(i => !i.isNew) }
            ]).map(group => group.items.length > 0 && (
              <div key={group.title} className="space-y-4">
                <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  {group.icon}
                  {group.title}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {group.items.map((item, i) => (
                    <div key={i} className="clean-card p-6 flex flex-col justify-between relative group">
                      <button 
                        onClick={() => setShareOpp({ title: item.title, link: item.applyLink || item.apply_link || window.location.href })}
                        className="absolute top-4 right-4 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Share"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <div>
                        <div className="flex justify-between items-start mb-2 pr-6">
                          <span className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                            {item.type || 'Opportunity'}
                          </span>
                          <div className="flex gap-2 items-center">
                            {item.isLive && <span className="text-[10px] uppercase font-bold text-white bg-red-500 px-2 py-0.5 rounded-full animate-pulse">Live</span>}
                            {(item.matchScore || item.smartMatch || item.smart_match) && <span className="text-xs font-semibold text-green-600">⚡ {item.matchScore ? item.matchScore + '% Match' : 'Smart Match'}</span>}
                          </div>
                        </div>
                        <h4 className="font-bold text-gray-900 mb-1">{item.title}</h4>
                        <p className="text-sm text-gray-500 mb-3">{item.organization || item.org}</p>
                        <p className="text-sm text-gray-700 line-clamp-2 mb-4">{item.description}</p>
                        {(item.matchReason || item.match_reason) && <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded mb-4">✓ {item.matchReason || item.match_reason}</p>}
                      </div>
                      <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-auto">
                         <div className="flex flex-wrap gap-2">
                           {item.tags?.slice(0,2).map((t: string) => (
                             <span key={t} className="text-[10px] bg-gray-100 px-2 py-1 text-gray-600 rounded">{t}</span>
                           ))}
                         </div>
                         <div className="flex items-center gap-2">
                           <button 
                             onClick={() => handleApplyAssist(item)}
                             className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors shadow-sm"
                           >
                             <FileText className="w-3.5 h-3.5 hidden sm:block" /> Assist
                           </button>
                           {(item.apply_link || item.applyLink) ? (
                             <a href={item.apply_link || item.applyLink} target="_blank" rel="noopener noreferrer" className="clean-btn px-4 py-1.5 text-xs font-bold hover:shadow-md transition-shadow">
                               Apply
                             </a>
                           ) : (
                             <span className="text-[10px] font-semibold text-red-500">DL: {item.deadline || item.daysLeft + 'd'}</span>
                           )}
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            <div className="flex justify-center pt-4">
              <button 
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="clean-btn-outline px-8 py-3 flex items-center gap-2 shadow-sm hover:shadow-md transition-shadow"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finding more...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Load More Opportunities
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="clean-card p-12 text-center border-dashed border-gray-200">
            <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Run the Scout Protocol to populate your feed.</p>
          </div>
        )}
      </div>

      <ShareModal 
        isOpen={!!shareOpp} 
        onClose={() => setShareOpp(null)} 
        opportunity={shareOpp} 
      />

      <ApplyAssistModal
        isOpen={isAssistModalOpen}
        onClose={() => setIsAssistModalOpen(false)}
        content={assistContent}
        isLoading={assistLoading}
        opportunityTitle={assistingOpp?.title || "Opportunity"}
      />

      {/* Scout Modal */}
      {showScoutModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
               <div>
                 <h3 className="text-xl font-bold text-gray-900">Scout Protocol</h3>
                 <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Step {scoutStep} of 4</p>
               </div>
               <button onClick={() => setShowScoutModal(false)} className="text-gray-400 hover:text-gray-600">
                 <Loader2 className="w-5 h-5 hidden" /> {/* Placeholder */}
                 Close
               </button>
            </div>
            
            <div className="p-8">
              {scoutStep === 1 && (
                <ScoutStep title="What year are you in?" 
                  options={['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Postgrad']}
                  selected={scoutData.year}
                  onSelect={(v: string) => { setScoutData({...scoutData, year: v}); setScoutStep(2); }}
                />
              )}
              {scoutStep === 2 && (
                <ScoutStep title="Field of study?" 
                  options={['Engineering', 'Science', 'Commerce', 'Arts', 'Law', 'Medicine', 'Design', 'Other']}
                  selected={scoutData.field}
                  onSelect={(v: string) => { setScoutData({...scoutData, field: v}); setScoutStep(3); }}
                />
              )}
              {scoutStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-lg font-bold text-gray-900">Technology Focus?</h4>
                  <p className="text-sm text-gray-500 mb-4">Enter your primary technical interests separated by commas.</p>
                  <input type="text" placeholder="e.g. AI/ML, Web Dev, Finance..." 
                    className="clean-input w-full p-3"
                    value={scoutData.tech}
                    onChange={e => setScoutData({...scoutData, tech: e.target.value})}
                    onKeyDown={e => { if (e.key === 'Enter') setScoutStep(4) }}
                  />
                  <div className="pt-4 flex justify-end gap-3">
                    <button onClick={() => setScoutStep(2)} className="clean-btn-outline px-4 py-2">Back</button>
                    <button onClick={() => setScoutStep(4)} className="clean-btn px-6 py-2">Next</button>
                  </div>
                </div>
              )}
              {scoutStep === 4 && (
                <ScoutStep title="Immediate goal?" 
                  options={['Internship', 'Hackathon', 'Scholarship', 'Mentorship', 'Job', 'Fellowship']}
                  selected={scoutData.goal}
                  onSelect={(v: string) => { 
                    const finalData = {...scoutData, goal: v};
                    setScoutData(finalData); 
                    handleScoutSubmit(finalData); 
                  }}
                  showBack={() => setScoutStep(3)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, highlight = false }: any) {
  return (
    <div className={`clean-card p-6 ${highlight ? 'border-blue-200 bg-blue-50/50' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-medium text-gray-500 truncate pr-4">{title}</p>
        <Icon className={`w-5 h-5 shrink-0 ${highlight ? 'text-blue-600' : 'text-gray-400'}`} />
      </div>
      <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
    </div>
  );
}

function ScoutStep({ title, options, selected, onSelect, showBack }: any) {
  return (
    <div className="space-y-6">
      <h4 className="text-lg font-bold text-gray-900">{title}</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {options.map((opt: string) => (
          <button 
            key={opt}
            onClick={() => onSelect(opt)}
            className={`px-4 py-3 text-sm font-medium rounded-lg border transition-all text-center ${selected === opt ? 'bg-blue-50 text-blue-700 border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
          >
            {opt}
          </button>
        ))}
      </div>
      {showBack && (
        <div className="pt-4 flex justify-start">
          <button onClick={showBack} className="text-sm font-medium text-gray-500 hover:text-gray-900">← Back</button>
        </div>
      )}
    </div>
  );
}
