import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { coursesService } from '../services/api.service';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Search, Filter, Book, Clock, Star } from 'lucide-react';

const CourseCatalog = () => {
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadCourses();
    }, []);

    const loadCourses = async () => {
        try {
            const data = await coursesService.getAllCourses();
            setCourses(data);
        } catch (error) {
            toast.error('Failed to load courses');
        } finally {
            setLoading(false);
        }
    };

    const filteredCourses = courses.filter(course =>
        course.Title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.Description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const viewCourse = (courseId) => {
        navigate(`/courses/${courseId}`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading courses...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Browse Courses</h1>
                    <p className="text-gray-500">Explore {courses.length} premium courses designed for your goals.</p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search for a course..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <Button variant="secondary" className="px-3">
                        <Filter className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Course Grid */}
            {filteredCourses.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-gray-500">No courses found. Try a different search term.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredCourses.map((course) => (
                        <Card key={course.CourseID} hoverable className="p-0 overflow-hidden flex flex-col group h-full">
                            <div className="h-48 overflow-hidden relative bg-gradient-to-br from-blue-400 to-purple-500">
                                {course.ThumbnailURL ? (
                                    <img
                                        src={course.ThumbnailURL}
                                        alt={course.Title}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-white">
                                        <Book className="w-16 h-16 opacity-50" />
                                    </div>
                                )}
                                <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-md text-xs font-bold text-gray-900 flex items-center gap-1 shadow-sm">
                                    {course.Level?.LevelName || 'All Levels'}
                                </div>
                            </div>

                            <div className="p-5 flex flex-col flex-1">
                                <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">{course.Title}</h3>
                                <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-1">{course.Description}</p>

                                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                                    {course.IsPublished && (
                                        <span className="flex items-center gap-1 text-green-600 font-medium">
                                            <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                                            Published
                                        </span>
                                    )}
                                </div>

                                <Button onClick={() => viewCourse(course.CourseID)} className="w-full">
                                    View Course
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CourseCatalog;
