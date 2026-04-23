import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Building2, MapPin, Calendar, Edit2, Trash2, Link } from 'lucide-react';

export default function ProjectManagement() {
  const { isAdmin } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [newProject, setNewProject] = useState({ 
    name: '', 
    description: '', 
    location: '',
    price: '',
    configuration: '',
    configurations: [] as { type: string; size: string; price: string }[],
    assets: [] as { title: string; url: string; type: string }[],
    possession: '',
    propertyType: 'residential'
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projects'));

    return () => unsubscribe();
  }, []);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'projects'), {
        ...newProject,
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewProject({ 
        name: '', 
        description: '', 
        location: '',
        price: '',
        configuration: '',
        configurations: [],
        assets: [],
        possession: '',
        propertyType: 'residential'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    try {
      const projectRef = doc(db, 'projects', editingProject.id);
      const { id, createdAt, ...updateData } = editingProject;
      await updateDoc(projectRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      setIsEditModalOpen(false);
      setEditingProject(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${editingProject.id}`);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'projects', projectId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
    }
  };

  const openEditModal = (project: any) => {
    setEditingProject(project);
    setIsEditModalOpen(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Projects</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">Manage real estate projects and inventory.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New Project
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {projects.map((project, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={project.id} 
            className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded tracking-wider">
                  {project.propertyType}
                </span>
                {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openEditModal(project)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Edit Project"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{project.name}</h3>
            <p className="text-gray-500 text-sm mb-4 line-clamp-2">{project.description}</p>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-xs">
                <p className="text-gray-400 uppercase font-bold tracking-tighter">Price</p>
                <p className="text-gray-900 font-semibold">{project.price || 'N/A'}</p>
              </div>
              <div className="text-xs">
                <p className="text-gray-400 uppercase font-bold tracking-tighter">Config</p>
                <p className="text-gray-900 font-semibold">{project.configuration || 'N/A'}</p>
              </div>
            </div>

            {project.configurations?.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter mb-2">Configurations</p>
                <div className="space-y-2">
                  {project.configurations.map((c: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg text-sm">
                      <div className="flex gap-2 items-center">
                        <span className="font-bold text-gray-900">{c.type}</span>
                        <span className="text-gray-500 text-xs">{c.size}</span>
                      </div>
                      <span className="font-bold text-blue-600">{c.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {project.assets?.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tighter mb-2">Assets</p>
                <div className="flex flex-wrap gap-2">
                  {project.assets.map((asset: any, idx: number) => (
                    <a key={idx} href={asset.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs font-semibold transition-colors">
                      <Link className="w-3.5 h-3.5 text-gray-400" />
                      {asset.title || asset.type}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-4 border-t border-gray-50">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4" />
                {project.location}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                Possession: {project.possession || 'N/A'}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Project</h2>
            <form onSubmit={handleAddProject} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Property Type</label>
                <select
                  value={newProject.propertyType}
                  onChange={(e) => setNewProject({ ...newProject, propertyType: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="plots">Plots</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Price Range</label>
                <input
                  type="text"
                  placeholder="e.g. 50L - 1.2Cr"
                  value={newProject.price}
                  onChange={(e) => setNewProject({ ...newProject, price: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Configuration</label>
                <input
                  type="text"
                  placeholder="e.g. 2BHK, 3BHK"
                  value={newProject.configuration}
                  onChange={(e) => setNewProject({ ...newProject, configuration: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Possession</label>
                <input
                  type="text"
                  placeholder="e.g. Dec 2025"
                  value={newProject.possession}
                  onChange={(e) => setNewProject({ ...newProject, possession: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  required
                  value={newProject.location}
                  onChange={(e) => setNewProject({ ...newProject, location: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                />
              </div>
              <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-bold text-gray-700">Configurations</label>
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, configurations: [...(newProject.configurations || []), { type: '', size: '', price: '' }] })}
                    className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {(newProject.configurations || []).map((conf, index) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2 mb-2 items-center">
                    <input
                      type="text"
                      placeholder="Type (e.g. 3 BHK)"
                      value={conf.type}
                      onChange={(e) => {
                        const newConfigs = [...newProject.configurations];
                        newConfigs[index].type = e.target.value;
                        setNewProject({ ...newProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Size (e.g. 1500 sqft)"
                      value={conf.size}
                      onChange={(e) => {
                        const newConfigs = [...newProject.configurations];
                        newConfigs[index].size = e.target.value;
                        setNewProject({ ...newProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Price"
                      value={conf.price}
                      onChange={(e) => {
                        const newConfigs = [...newProject.configurations];
                        newConfigs[index].price = e.target.value;
                        setNewProject({ ...newProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newConfigs = newProject.configurations.filter((_, i) => i !== index);
                        setNewProject({ ...newProject, configurations: newConfigs });
                      }}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="col-span-2 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-bold text-gray-700">Project Assets</label>
                  <button
                    type="button"
                    onClick={() => setNewProject({ ...newProject, assets: [...(newProject.assets || []), { title: '', url: '', type: 'Document' }] })}
                    className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {(newProject.assets || []).map((asset, index) => (
                  <div key={index} className="grid grid-cols-[1fr,2fr,auto,auto] gap-2 mb-2 items-center">
                    <select
                      value={asset.type}
                      onChange={(e) => {
                        const newAssets = [...newProject.assets];
                        newAssets[index].type = e.target.value;
                        setNewProject({ ...newProject, assets: newAssets });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    >
                      <option value="Document">Doc/PDF</option>
                      <option value="Video">YouTube/Video</option>
                      <option value="Script">Script</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Title or description"
                      value={asset.title}
                      onChange={(e) => {
                        const newAssets = [...newProject.assets];
                        newAssets[index].title = e.target.value;
                        setNewProject({ ...newProject, assets: newAssets });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <div className="relative">
                      <Link className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        placeholder="URL address"
                        value={asset.url}
                        onChange={(e) => {
                          const newAssets = [...newProject.assets];
                          newAssets[index].url = e.target.value;
                          setNewProject({ ...newProject, assets: newAssets });
                        }}
                        className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newAssets = newProject.assets.filter((_, i) => i !== index);
                        setNewProject({ ...newProject, assets: newAssets });
                      }}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="col-span-2 flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Create Project
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingProject && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Project</h2>
            <form onSubmit={handleUpdateProject} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Property Type</label>
                <select
                  value={editingProject.propertyType}
                  onChange={(e) => setEditingProject({ ...editingProject, propertyType: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="plots">Plots</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Price Range</label>
                <input
                  type="text"
                  placeholder="e.g. 50L - 1.2Cr"
                  value={editingProject.price}
                  onChange={(e) => setEditingProject({ ...editingProject, price: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Configuration</label>
                <input
                  type="text"
                  placeholder="e.g. 2BHK, 3BHK"
                  value={editingProject.configuration}
                  onChange={(e) => setEditingProject({ ...editingProject, configuration: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Possession</label>
                <input
                  type="text"
                  placeholder="e.g. Dec 2025"
                  value={editingProject.possession}
                  onChange={(e) => setEditingProject({ ...editingProject, possession: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                <input
                  type="text"
                  required
                  value={editingProject.location}
                  onChange={(e) => setEditingProject({ ...editingProject, location: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingProject.description}
                  onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                />
              </div>
              <div className="col-span-2 mt-4 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-bold text-gray-700">Configurations</label>
                  <button
                    type="button"
                    onClick={() => setEditingProject({ ...editingProject, configurations: [...(editingProject.configurations || []), { type: '', size: '', price: '' }] })}
                    className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {(editingProject.configurations || []).map((conf: any, index: number) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2 mb-2 items-center">
                    <input
                      type="text"
                      placeholder="Type (e.g. 3 BHK)"
                      value={conf.type}
                      onChange={(e) => {
                        const newConfigs = [...editingProject.configurations];
                        newConfigs[index].type = e.target.value;
                        setEditingProject({ ...editingProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Size (e.g. 1500 sqft)"
                      value={conf.size}
                      onChange={(e) => {
                        const newConfigs = [...editingProject.configurations];
                        newConfigs[index].size = e.target.value;
                        setEditingProject({ ...editingProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Price"
                      value={conf.price}
                      onChange={(e) => {
                        const newConfigs = [...editingProject.configurations];
                        newConfigs[index].price = e.target.value;
                        setEditingProject({ ...editingProject, configurations: newConfigs });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newConfigs = editingProject.configurations.filter((_: any, i: number) => i !== index);
                        setEditingProject({ ...editingProject, configurations: newConfigs });
                      }}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="col-span-2 pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-bold text-gray-700">Project Assets</label>
                  <button
                    type="button"
                    onClick={() => setEditingProject({ ...editingProject, assets: [...(editingProject.assets || []), { title: '', url: '', type: 'Document' }] })}
                    className="p-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {(editingProject.assets || []).map((asset: any, index: number) => (
                  <div key={index} className="grid grid-cols-[1fr,2fr,auto,auto] gap-2 mb-2 items-center">
                    <select
                      value={asset.type}
                      onChange={(e) => {
                        const newAssets = [...editingProject.assets];
                        newAssets[index].type = e.target.value;
                        setEditingProject({ ...editingProject, assets: newAssets });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    >
                      <option value="Document">Doc/PDF</option>
                      <option value="Video">YouTube/Video</option>
                      <option value="Script">Script</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Title or description"
                      value={asset.title}
                      onChange={(e) => {
                        const newAssets = [...editingProject.assets];
                        newAssets[index].title = e.target.value;
                        setEditingProject({ ...editingProject, assets: newAssets });
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                    />
                    <div className="relative">
                      <Link className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        placeholder="URL address"
                        value={asset.url}
                        onChange={(e) => {
                          const newAssets = [...editingProject.assets];
                          newAssets[index].url = e.target.value;
                          setEditingProject({ ...editingProject, assets: newAssets });
                        }}
                        className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newAssets = editingProject.assets.filter((_: any, i: number) => i !== index);
                        setEditingProject({ ...editingProject, assets: newAssets });
                      }}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="col-span-2 flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Save Changes
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
