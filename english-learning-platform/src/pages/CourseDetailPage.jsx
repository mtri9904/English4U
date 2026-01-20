import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { coursesService } from '../services/api.service';

const CourseDetailPage = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedUnits, setExpandedUnits] = useState(new Set());

    useEffect(() => {
        loadCourseDetails();
    }, [courseId]);

    const loadCourseDetails = async () => {
        try {
            const data = await coursesService.getCourseById(courseId);
            setCourse(data);
            // Expand first unit by default
            if (data.units && data.units.length > 0) {
                setExpandedUnits(new Set([data.units[0].UnitID]));
            }
        } catch (error) {
            toast.error('Failed to load course details');
        } finally {
            setLoading(false);
        }
    };

    const toggleUnit = (unitId) => {
        const newExpanded = new Set(expandedUnits);
        if (newExpanded.has(unitId)) {
            newExpanded.delete(unitId);
        } else {
            newExpanded.add(unitId);
        }
        setExpandedUnits(newExpanded);
    };

    const startLesson = (lessonId) => {
        navigate(`/lessons/${lessonId}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading course...</p>
                </div>
            </div>
        );
    }

    if (!course) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Course not found</h2>
                    <button onClick={() => navigate('/courses')} className="text-blue-600 hover:underline">
                        Back to courses
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                <div className="max-w-6xl mx-auto px-4 py-16">
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => navigate('/courses')} className="hover:bg-white/10 p-2 rounded-lg transition">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
                            {course.Level?.LevelName || 'Level'}
                        </span>
                    </div>

                    <h1 className="text-4xl font-bold mb-4">{course.Title}</h1>
                    <p className="text-blue-100 text-lg mb-6 max-w-3xl">{course.Description}</p>

                    <div className="flex flex-wrap gap-6">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"></path>
                            </svg>
                            <span>{course.units?.length || 0} Units</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
                            </svg>
                            <span>Self-paced</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Course Content */}
            <div className="max-w-6xl mx-auto px-4 py-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Course Content</h2>

                <div className="space-y-4">
                    {course.units?.map((unit, unitIndex) => (
                        <div key={unit.UnitID} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            {/* Unit Header */}
                            <button
                                onClick={() => toggleUnit(unit.UnitID)}
                                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg">
                                        {unitIndex + 1}
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-lg text-gray-900">{unit.Title}</h3>
                                        {unit.Description && (
                                            <p className="text-gray-600 text-sm mt-1">{unit.Description}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-500">{unit.lessons?.length || 0} lessons</span>
                                    <svg
                                        className={`w-5 h-5 text-gray-400 transition-transform ${expandedUnits.has(unit.UnitID) ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>

                            {/* Lessons List */}
                            {expandedUnits.has(unit.UnitID) && (
                                <div className="border-t border-gray-200">
                                    {unit.lessons?.map((lesson, lessonIndex) => (
                                        <div
                                            key={lesson.LessonID}
                                            className="flex items-center justify-between p-4 hover:bg-gray-50 transition border-b border-gray-100 last:border-b-0"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="text-gray-400 font-medium w-8 text-center">
                                                    {lessonIndex + 1}
                                                </div>

                                                <div className="flex-1">
                                                    <h4 className="font-medium text-gray-900">{lesson.Title}</h4>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-medium">
                                                            {lesson.LessonType}
                                                        </span>
                                                        {lesson.Duration && (
                                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
                                                                </svg>
                                                                {lesson.Duration} min
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => startLesson(lesson.LessonID)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
                                            >
                                                Start
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CourseDetailPage;
