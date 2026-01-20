import React from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Target, TrendingUp, Award, Zap, BookOpen, Clock, ChevronRight, PlayCircle } from 'lucide-react';

const StudentDashboard = () => {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-100 pb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Good Morning, Hande! ☀️</h1>
                    <p className="text-gray-500 mt-1">Keep up the momentum. You're on a 12-day streak!</p>
                </div>
                <Button className="shadow-lg shadow-primary/25">
                    Resume Learning
                </Button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    icon={<Target className="w-6 h-6 text-white" />}
                    color="bg-primary"
                    label="Current Goal"
                    value="IELTS 7.0"
                    subtext="Target: Dec 2025"
                />
                <StatCard
                    icon={<TrendingUp className="w-6 h-6 text-white" />}
                    color="bg-green-600"
                    label="Overall Progress"
                    value="65%"
                    subtext="+2% this week"
                />
                <StatCard
                    icon={<Zap className="w-6 h-6 text-white" />}
                    color="bg-orange-500"
                    label="Day Streak"
                    value="12 Days"
                    subtext="Personal record!"
                />
                <StatCard
                    icon={<Award className="w-6 h-6 text-white" />}
                    color="bg-purple-500"
                    label="Certificates"
                    value="1 Earned"
                    subtext="2 in progress"
                />
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Recommended Lessons (Left 2/3) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Recommended for Today</h2>
                        <button className="text-primary text-sm font-medium hover:underline">View Learning Path</button>
                    </div>

                    <div className="space-y-4">
                        <LessonCard
                            category="Speaking"
                            title="Describe your Hometown"
                            duration="15 min"
                            level="Intermediate"
                            color="text-purple-600 bg-purple-50"
                        />
                        <LessonCard
                            category="Listening"
                            title="Academic Lecture: Biology"
                            duration="20 min"
                            level="Advanced"
                            color="text-blue-600 bg-blue-50"
                        />
                        <LessonCard
                            category="Vocabulary"
                            title="Essential Words for Writing"
                            duration="10 min"
                            level="Beginner"
                            color="text-green-600 bg-green-50"
                        />
                    </div>
                </div>

                {/* Sidebar / Weak Skills (Right 1/3) */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-gray-900">Skill Analysis</h2>
                    <Card className="p-0 overflow-hidden">
                        <div className="p-6">
                            <div className="space-y-5">
                                <SkillProgress skill="Listening" percent={75} color="bg-blue-500" />
                                <SkillProgress skill="Reading" percent={82} color="bg-green-500" />
                                <SkillProgress skill="Speaking" percent={45} color="bg-orange-500" error />
                                <SkillProgress skill="Writing" percent={60} color="bg-purple-500" />
                            </div>
                        </div>
                        <div className="bg-orange-50 p-4 border-t border-orange-100">
                            <div className="flex gap-3">
                                <div className="p-2 bg-white rounded-lg text-orange-600 shadow-sm h-fit">
                                    <TrendingUp className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Focus Area: Speaking</p>
                                    <p className="text-xs text-gray-600 mt-1">Your speaking score is lagging behind. Try 2 practice sessions today.</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

/* Sub-components for cleanliness */
const StatCard = ({ icon, color, label, value, subtext }) => (
    <Card hoverable className="relative overflow-hidden border-0 shadow-md">
        {/* Decorative background circle */}
        <div className={`absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 rounded-full opacity-10 ${color}`}></div>

        <div className="flex flex-col h-full justify-between">
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl shadow-lg shadow-gray-200 ${color}`}>
                    {icon}
                </div>
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
                <p className="text-xs text-gray-400 mt-2">{subtext}</p>
            </div>
        </div>
    </Card>
);

const LessonCard = ({ category, title, duration, level, color }) => (
    <Card hoverable className="flex flex-col sm:flex-row gap-4 items-center p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all">
        <div className="w-full sm:w-48 h-32 bg-gray-100 rounded-lg shrink-0 overflow-hidden relative group">
            <img
                src={`https://source.unsplash.com/random/400x300/?${category}`}
                alt="Lesson"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" // Fallback color if unsplash fails
                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.backgroundColor = '#e5e7eb' }}
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <PlayCircle className="w-10 h-10 text-white" />
            </div>
        </div>
        <div className="flex-1 w-full">
            <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${color}`}>{category}</span>
                <span className="text-xs text-gray-400 font-medium">{level}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2 truncate">{title}</h3>
            <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {duration}</span>
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> 250 students enrolled</span>
            </div>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0 w-full sm:w-auto">Start</Button>
    </Card>
);

const SkillProgress = ({ skill, percent, color, error }) => (
    <div>
        <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-gray-700">{skill}</span>
            <span className="font-bold text-gray-900">{percent}/100</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
                className={`h-full rounded-full ${color} ${error ? 'bg-orange-500' : ''}`}
                style={{ width: `${percent}%` }}
            ></div>
        </div>
    </div>
);

export default StudentDashboard;
