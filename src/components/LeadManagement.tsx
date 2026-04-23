import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, where, arrayUnion, writeBatch, deleteDoc, getDocs, setDoc, getDoc, getDocFromServer } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { analyzeCallRecordingUrl, analyzeCallRecording, chatWithGemini, suggestFollowUpReminders, generateCollectiveCallSummary, transcribeAudio } from '../services/geminiService';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Filter, MessageSquare, Edit2, Edit3, CheckCircle, XCircle, Upload, FileSpreadsheet, FileText, Check, User, Calendar, Clock, CheckSquare, Trash2, ChevronUp, ChevronDown, RefreshCw, Link, CornerUpLeft, X, Download, Send, Bot, Sparkles, Phone, Mail, Mic, Square } from 'lucide-react';
import Papa from 'papaparse';

import * as XLSX from 'xlsx';
import { showToast } from './ErrorBoundary';

const TagInput = ({ tags, onChange, placeholder = "Add tag..." }: { tags: string[], onChange: (tags: string[]) => void, placeholder?: string }) => {
  const [input, setInput] = useState('');

  const addTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim())) {
        onChange([...tags, input.trim()]);
      }
      setInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-indigo-900">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={addTag}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
      />
    </div>
  );
};

export default function LeadManagement() {
  const { profile, isAdmin, isSM, isPartner, isVendor, isVendorManager, isVendorEditor } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sms, setSMs] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    statuses: ['new', 'assigned', 'contacted', 'site_visit_proposed', 'site_visit_done', 'converted', 'lost', 'returned_to_vendor'],
    lostReasons: ['not contacted', 'not interested', 'budget not matched', 'location not matched', 'purchased elsewhere']
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editLeadData, setEditLeadData] = useState<any>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [lostLeadIds, setLostLeadIds] = useState<string[]>([]);
  const [selectedLostReason, setSelectedLostReason] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [newLead, setNewLead] = useState({
    enquiryId: '',
    projectId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    livingLocation: '',
    gender: '',
    companyName: '',
    profession: '',
    designation: '',
    linkedinProfile: '',
    clientType: 'end_user', // investor or end_user
    priority: 'Medium',
    budget: 0,
    possession: '',
    status: 'new',
    vendorNotes: '',
    partnerId: '',
    agencyId: '',
    sourceId: '',
    subsourceId: '',
    callRecordingUrl: '',
    callAnalysis: null as any,
    tags: [] as string[]
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{added: number, skipped: number} | null>(null);
  const [statusUpdate, setStatusUpdate] = useState({
    leadIds: [] as string[],
    status: '',
    notes: '',
    createTask: false,
    taskTitle: '',
    taskDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    taskAssignedTo: ''
  });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [subsources, setSubsources] = useState<any[]>([]);
  const [isHierarchyModalOpen, setIsHierarchyModalOpen] = useState(false);
  const [currentAgency, setCurrentAgency] = useState<any>(null);
  const [currentSource, setCurrentSource] = useState<any>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnLeadId, setReturnLeadId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackRecordingFile, setFeedbackRecordingFile] = useState<File | null>(null);
  const [feedbackCloudUrl, setFeedbackCloudUrl] = useState('');
  const [isUploadingFeedbackRecording, setIsUploadingFeedbackRecording] = useState(false);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<any[]>([]);
  const [isSuggestingFollowUps, setIsSuggestingFollowUps] = useState(false);
  const [collectiveCallSummary, setCollectiveCallSummary] = useState<any>(null);
  const [isGeneratingCollectiveSummary, setIsGeneratingCollectiveSummary] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [feedbackView, setFeedbackView] = useState<'vendor' | 'sm' | 'history' | 'tasks' | 'call_analysis'>('history');
  const [smViewMode, setSmViewMode] = useState<'all' | 'my'>('my');
  const [tasks, setTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ title: '', dueDate: new Date().toISOString().split('T')[0], assignedTo: '' });
  const [bulkUploadProject, setBulkUploadProject] = useState('');
  const [bulkUploadVendor, setBulkUploadVendor] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    projectId: '',
    vendorId: '',
    smId: '',
    dateFrom: '',
    dateTo: '',
    status: '',
    agencyId: '',
    sourceId: '',
    subsourceId: '',
    scoreMin: '',
    scoreMax: '',
    taskDateFrom: '',
    taskDateTo: '',
    tags: '',
  });
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  useEffect(() => {
    if (profile?.uid) {
      // Using getDocFromServer as a connection test as per requirements
      getDocFromServer(doc(db, 'integrations', profile.uid)).then(docSnap => {
        if (docSnap.exists()) {
          setSheetUrl(docSnap.data().googleSheetUrl || '');
        }
      }).catch(error => {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        } else {
          console.error("Error fetching integration settings:", error);
        }
      });
    }
  }, [profile]);

  useEffect(() => {
    setFollowUpSuggestions([]);
  }, [selectedLead?.id]);

  useEffect(() => {
    if (selectedLead) {
      const updatedLead = leads.find(l => l.id === selectedLead.id);
      if (updatedLead) {
        // Sync to ensure side panel shows latest updates (status, analysis, etc.)
        if (JSON.stringify(updatedLead) !== JSON.stringify(selectedLead)) {
          setSelectedLead(updatedLead);
        }
      }
    }
  }, [leads, selectedLead?.id]);

  useEffect(() => {
    if (!profile) return;

    // Fetch Settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'leads'), (docSnap) => {
      if (docSnap.exists()) setSettings(docSnap.data());
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/leads'));

    // Fetch Leads
    const leadsRef = collection(db, 'leads');
    let leadsQuery = query(leadsRef);
    if (isPartner || isVendor) leadsQuery = query(leadsRef, where('partnerId', '==', profile.vendorCompanyId || profile.uid));
    else if (isSM && smViewMode === 'my') leadsQuery = query(leadsRef, where('smId', '==', profile.uid));

    const unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // If SM and in "My Leads" mode, filter locally if query didn't (though query should have)
      setLeads(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    // Fetch Projects
    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projects'));

    // Fetch SMs for assignment
    let unsubscribeSMs: () => void = () => {};
    let unsubscribeAdmins: () => void = () => {};
    let unsubscribePartners: () => void = () => {};

    if (isAdmin || isPartner || isVendor || isSM) {
      unsubscribeSMs = onSnapshot(query(collection(db, 'users'), where('role', '==', 'sm')), (snapshot) => {
        setSMs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/sm'));
      
      unsubscribeAdmins = onSnapshot(query(collection(db, 'users'), where('role', '==', 'admin')), (snapshot) => {
        setAdmins(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/admin'));
    }

    if (isAdmin || isSM) {
      unsubscribePartners = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['partner', 'vendor', 'vendor_manager', 'vendor_editor', 'vendor_viewer'])), (snapshot) => {
        setPartners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/partners'));
    }

    const unsubscribeAllTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setAllTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    const unsubscribeAgencies = onSnapshot(collection(db, 'agencies'), (snapshot) => {
      setAgencies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'agencies'));

    const unsubscribeSources = onSnapshot(collection(db, 'sources'), (snapshot) => {
      setSources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'sources'));

    const unsubscribeSubsources = onSnapshot(collection(db, 'subsources'), (snapshot) => {
      setSubsources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'subsources'));

    return () => {
      unsubscribeSettings();
      unsubscribeLeads();
      unsubscribeProjects();
      unsubscribeSMs();
      unsubscribeAdmins();
      unsubscribePartners();
      unsubscribeAllTasks();
      unsubscribeAgencies();
      unsubscribeSources();
      unsubscribeSubsources();
    };
  }, [profile, isAdmin, isSM, isPartner, isVendor, smViewMode]);

  useEffect(() => {
    if (selectedLead) {
      if (isSM || isAdmin) setFeedbackView('sm');
      else setFeedbackView('vendor');

      // Fetch Tasks for selected lead
      const tasksRef = collection(db, 'tasks');
      const q = query(tasksRef, where('leadId', '==', selectedLead.id));
      const unsubscribeTasks = onSnapshot(q, (snapshot) => {
        setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

      return () => unsubscribeTasks();
    }
  }, [selectedLead, isSM, isAdmin]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newTask.title || !newTask.assignedTo) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        leadId: selectedLead.id,
        title: newTask.title,
        dueDate: newTask.dueDate,
        assignedTo: newTask.assignedTo,
        completed: false,
        createdBy: profile?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewTask({ title: '', dueDate: new Date().toISOString().split('T')[0], assignedTo: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTaskCompletion = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        completed: !currentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    
    try {
      const batch = writeBatch(db);
      selectedLeadIds.forEach(id => {
        batch.delete(doc(db, 'leads', id));
      });
      await batch.commit();
      setSelectedLeadIds([]);
      setIsBulkDeleteModalOpen(false);
      showToast(`${selectedLeadIds.length} leads deleted successfully`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'leads/bulk');
    }
  };

  const handleHierarchyAction = async (type: 'agency' | 'source' | 'subsource', action: 'add' | 'delete', data: any) => {
    const collectionName = type === 'agency' ? 'agencies' : type === 'source' ? 'sources' : 'subsources';
    try {
      if (action === 'add') {
        await addDoc(collection(db, collectionName), {
          ...data,
          partnerId: profile?.vendorCompanyId || profile?.uid,
          createdAt: serverTimestamp()
        });
        showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} added successfully`, 'success');
      } else if (action === 'delete') {
        await deleteDoc(doc(db, collectionName, data.id));
        showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`, 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, collectionName);
    }
  };

  const calculateLeadScore = (lead: any) => {
    let score = 0;
    const breakdown = { budget: 0, engagement: 0, status: 0 };

    // 1. Budget (Max 40 points)
    const budget = Number(lead.budget) || 0;
    if (budget > 10000000) breakdown.budget = 40;
    else if (budget > 5000000) breakdown.budget = 30;
    else if (budget > 2000000) breakdown.budget = 20;
    else if (budget > 0) breakdown.budget = 10;
    score += breakdown.budget;

    // 2. Engagement (Max 30 points)
    const historyCount = lead.statusHistory?.length || 0;
    const feedbackCount = lead.partnerFeedback?.length || 0;
    const histPts = Math.min(historyCount * 5, 15);
    const feedPts = Math.min(feedbackCount * 5, 15);
    breakdown.engagement = histPts + feedPts;
    score += breakdown.engagement;

    // 3. Status (Max 30 points)
    const statusScores: { [key: string]: number } = {
      'converted': 30,
      'site_visit_done': 25,
      'site_visit_proposed': 20,
      'contacted': 15,
      'assigned': 12,
      'new': 10,
      'returned_to_vendor': 5,
      'lost': 0
    };
    breakdown.status = statusScores[lead.status] || 0;
    score += breakdown.status;

    // 4. Priority Bonus
    if (lead.priority === 'High') score += 10;
    else if (lead.priority === 'Medium') score += 5;

    let finalScore = Math.min(score, 100);
    if (lead.callAnalysis?.suggestedScore) {
      finalScore = Math.round((finalScore + Number(lead.callAnalysis.suggestedScore)) / 2);
    }

    return { total: finalScore, breakdown };
  };

  const handleAnalyzeRecording = async (mode: 'new' | 'edit' = 'new') => {
    const targetData = mode === 'new' ? newLead : editLeadData;
    const setter = mode === 'new' ? setNewLead : setEditLeadData;

    if (!targetData.callRecordingUrl && !recordingFile) {
      showToast('Please provide a URL or upload a file first.', 'info');
      return;
    }

    setIsAnalyzing(true);
    try {
      let analysis;
      
      if (recordingFile) {
        // Upload to storage first to get URL for the lead record
        const fileRef = ref(storage, `recordings/${Date.now()}_${recordingFile.name}`);
        await uploadBytes(fileRef, recordingFile);
        const urlToAnalyze = await getDownloadURL(fileRef);
        setter((prev: any) => ({ ...prev, callRecordingUrl: urlToAnalyze }));

        // Convert file to base64 for Gemini analysis
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(recordingFile);
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data:audio/mp3;base64,
          };
          reader.onerror = error => reject(error);
        });
        
        analysis = await analyzeCallRecording(base64, recordingFile.type || 'audio/mp3');
      } else {
        analysis = await analyzeCallRecordingUrl(targetData.callRecordingUrl);
      }

      setter((prev: any) => ({ ...prev, callAnalysis: analysis }));
      showToast('Recording analyzed successfully!', 'success');
    } catch (error) {
      console.error('Error analyzing recording:', error);
      showToast(error instanceof Error ? error.message : 'Failed to analyze recording.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateCollectiveSummary = async () => {
    if (sortedLeads.length === 0) {
      showToast('No leads available to summarize.', 'info');
      return;
    }

    const leadsWithAnalyses = sortedLeads.filter(l => l.callAnalysis);
    if (leadsWithAnalyses.length === 0) {
      showToast('No call recordings analyzed for these leads yet.', 'info');
      return;
    }

    setIsGeneratingCollectiveSummary(true);
    try {
      const summary = await generateCollectiveCallSummary(sortedLeads);
      setCollectiveCallSummary(summary);
      showToast('Project intelligence summary generated!', 'success');
    } catch (error) {
      console.error('Error generating collective summary:', error);
      showToast('Failed to generate collective summary.', 'error');
    } finally {
      setIsGeneratingCollectiveSummary(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleTranscription(audioBlob);
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      showToast('Microphone access denied or not available.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
      });

      const transcript = await transcribeAudio(base64, blob.type);
      setStatusUpdate(prev => ({ 
        ...prev, 
        notes: prev.notes ? `${prev.notes}\n\n[Voice Note]: ${transcript}` : `[Voice Note]: ${transcript}` 
      }));
      showToast('Voice note transcribed!', 'success');
    } catch (error) {
      console.error('Error transcribing voice note:', error);
      showToast('Failed to transcribe voice note.', 'error');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAnalyzeSelectedLeadRecording = async () => {
    if (!selectedLead || !selectedLead.callRecordingUrl) return;

    setIsAnalyzing(true);
    try {
      const analysis = await analyzeCallRecordingUrl(selectedLead.callRecordingUrl);
      
      const leadRef = doc(db, 'leads', selectedLead.id);
      await updateDoc(leadRef, {
        callAnalysis: analysis,
        priority: analysis.priority || selectedLead.priority,
        tags: [...new Set([...(selectedLead.tags || []), ...(analysis.tags || [])])],
        updatedAt: serverTimestamp()
      });
      
      showToast('Lead intelligence generated!', 'success');
    } catch (error) {
      console.error('Error analyzing selected lead:', error);
      showToast('Failed to analyze recording.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let finalRecordingUrl = newLead.callRecordingUrl;

      // If there's a file but it wasn't analyzed yet, upload it now
      if (recordingFile && !finalRecordingUrl) {
        const fileRef = ref(storage, `recordings/${Date.now()}_${recordingFile.name}`);
        await uploadBytes(fileRef, recordingFile);
        finalRecordingUrl = await getDownloadURL(fileRef);
      }

      const selectedPartner = (isAdmin || isSM) && newLead.partnerId 
        ? partners.find(p => p.uid === newLead.partnerId) 
        : { uid: profile?.vendorCompanyId || profile?.uid, displayName: profile?.displayName };

      await addDoc(collection(db, 'leads'), {
        ...newLead,
        callRecordingUrl: finalRecordingUrl,
        priority: newLead.priority || newLead.callAnalysis?.priority || 'Medium',
        tags: [...(newLead.tags || []), ...(newLead.callAnalysis?.tags || [])].filter((v, i, a) => a.indexOf(v) === i),
        partnerId: selectedPartner?.uid,
        partnerName: selectedPartner?.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        partnerFeedback: [],
        statusHistory: [{
          status: 'new',
          notes: newLead.vendorNotes,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        }]
      });
      setIsModalOpen(false);
      setNewLead({ 
        enquiryId: '', 
        projectId: '', 
        customerName: '', 
        customerPhone: '', 
        customerEmail: '',
        livingLocation: '',
        gender: '',
        companyName: '',
        profession: '',
        designation: '',
        linkedinProfile: '',
        clientType: 'end_user',
        priority: 'Medium',
        budget: 0, 
        possession: '', 
        status: 'new', 
        vendorNotes: '', 
        partnerId: '', 
        agencyId: '',
        sourceId: '',
        subsourceId: '',
        callRecordingUrl: '', 
        callAnalysis: null, 
        tags: [] 
      });
      setRecordingFile(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    }
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => processBulkData(results.data),
        error: (error) => console.error('CSV Parse Error:', error)
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processBulkData(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processBulkData = async (data: any[]) => {
    if (!profile) return;
    if (!bulkUploadProject) {
      showToast('Please select a project before uploading.', 'error');
      return;
    }

    const batch = writeBatch(db);
    const leadsRef = collection(db, 'leads');
    const selectedVendor = partners.find(p => p.uid === bulkUploadVendor);

    data.forEach((row) => {
      if (!row.enquiryId) return;
      
      const newDocRef = doc(leadsRef);
      batch.set(newDocRef, {
        enquiryId: String(row.enquiryId),
        projectId: bulkUploadProject,
        customerName: String(row.customerName || ''),
        customerPhone: String(row.customerPhone || ''),
        customerEmail: String(row.customerEmail || ''),
        livingLocation: String(row.livingLocation || ''),
        gender: String(row.gender || ''),
        companyName: String(row.companyName || ''),
        profession: String(row.profession || ''),
        designation: String(row.designation || ''),
        linkedinProfile: String(row.linkedinProfile || ''),
        clientType: String(row.clientType || 'end_user'),
        budget: Number(row.budget) || 0,
        possession: String(row.possession || ''),
        status: 'new',
        vendorNotes: String(row.vendorNotes || ''),
        callRecordingUrl: String(row.callRecordingUrl || ''),
        callAnalysis: null,
        partnerId: bulkUploadVendor || profile.vendorCompanyId || profile.uid,
        partnerName: selectedVendor?.displayName || profile.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        partnerFeedback: [],
        statusHistory: [{
          status: 'new',
          notes: 'Bulk uploaded',
          updatedAt: new Date(),
          updatedBy: profile.displayName
        }]
      });
    });

    try {
      await batch.commit();
      setIsBulkModalOpen(false);
      showToast('Bulk upload successful!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/bulk');
    }
  };

  const handleSyncSheet = async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      if (profile?.uid) {
        await setDoc(doc(db, 'integrations', profile.uid), { googleSheetUrl: sheetUrl }, { merge: true });
      }

      const response = await fetch(sheetUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const csvText = await response.text();

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const data = results.data;
          let added = 0;
          let skipped = 0;

          const leadsRef = collection(db, 'leads');
          let q;
          if (isAdmin || isSM) {
             q = query(leadsRef);
          } else {
             q = query(leadsRef, where('partnerId', '==', profile?.vendorCompanyId || profile?.uid));
          }
          const snapshot = await getDocs(q);
          const existingIds = new Set(snapshot.docs.map(d => (d.data() as any).enquiryId));

          let batch = writeBatch(db);
          let batchCount = 0;

          for (const row of data as any[]) {
            if (!row.enquiryId || !row.projectId) continue;
            if (existingIds.has(String(row.enquiryId))) {
              skipped++;
              continue;
            }

            const newDocRef = doc(leadsRef);
            batch.set(newDocRef, {
              enquiryId: String(row.enquiryId),
              projectId: String(row.projectId),
              customerName: String(row.customerName || ''),
              customerPhone: String(row.customerPhone || ''),
              customerEmail: String(row.customerEmail || ''),
              livingLocation: String(row.livingLocation || ''),
              gender: String(row.gender || ''),
              companyName: String(row.companyName || ''),
              profession: String(row.profession || ''),
              designation: String(row.designation || ''),
              linkedinProfile: String(row.linkedinProfile || ''),
              clientType: String(row.clientType || 'end_user'),
              budget: Number(row.budget) || 0,
              possession: String(row.possession || ''),
              status: 'new',
              vendorNotes: String(row.vendorNotes || ''),
              callRecordingUrl: String(row.callRecordingUrl || ''),
              callAnalysis: null,
              partnerId: profile?.vendorCompanyId || profile?.uid,
              partnerName: profile?.displayName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              partnerFeedback: [],
              statusHistory: [{
                status: 'new',
                notes: 'Synced from Google Sheets',
                updatedAt: new Date(),
                updatedBy: profile?.displayName
              }]
            });
            added++;
            batchCount++;

            if (batchCount === 490) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
          
          if (batchCount > 0) {
            await batch.commit();
          }
          
          setSyncResult({ added, skipped });
          setIsSyncing(false);
        },
        error: (error) => {
          console.error('CSV Parse Error:', error);
          showToast('Failed to parse the Google Sheet. Please ensure it is published as a CSV.', 'error');
          setIsSyncing(false);
        }
      });
    } catch (error) {
      console.error("Sync error:", error);
      showToast("Failed to fetch the Google Sheet. Please check the URL and ensure it's published to the web as CSV.", 'error');
      setIsSyncing(false);
    }
  };

  const handleEditLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLeadData) return;
    try {
      await updateDoc(doc(db, 'leads', editLeadData.id), {
        customerName: editLeadData.customerName,
        customerPhone: editLeadData.customerPhone,
        customerEmail: editLeadData.customerEmail || '',
        livingLocation: editLeadData.livingLocation || '',
        gender: editLeadData.gender || '',
        companyName: editLeadData.companyName || '',
        profession: editLeadData.profession || '',
        designation: editLeadData.designation || '',
        linkedinProfile: editLeadData.linkedinProfile || '',
        clientType: editLeadData.clientType || 'end_user',
        priority: editLeadData.priority || 'Medium',
        budget: editLeadData.budget,
        possession: editLeadData.possession,
        agencyId: editLeadData.agencyId || '',
        sourceId: editLeadData.sourceId || '',
        subsourceId: editLeadData.subsourceId || '',
        callRecordingUrl: editLeadData.callRecordingUrl || '',
        callAnalysis: editLeadData.callAnalysis || null,
        tags: editLeadData.tags || [],
        updatedAt: serverTimestamp()
      });
      setIsEditModalOpen(false);
      setEditLeadData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${editLeadData.id}`);
    }
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    try {
      await deleteDoc(doc(db, 'leads', leadToDelete));
      setIsDeleteModalOpen(false);
      setLeadToDelete(null);
      showToast('Lead deleted successfully.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leads/${leadToDelete}`);
    }
  };

  const confirmDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
    setIsDeleteModalOpen(true);
  };

  const handleUpdateStatus = (leadId: string, status: string) => {
    if (status === 'lost') {
      setLostLeadIds([leadId]);
      setIsLostModalOpen(true);
      return;
    }
    setStatusUpdate({ 
      leadIds: [leadId], 
      status, 
      notes: '',
      createTask: false,
      taskTitle: '',
      taskDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      taskAssignedTo: ''
    });
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { leadIds, status, notes, createTask, taskTitle, taskDueDate, taskAssignedTo } = statusUpdate;
    const batch = writeBatch(db);
    
    leadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        status, 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status,
          notes,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });

      if (createTask && taskTitle && taskAssignedTo) {
        const taskRef = doc(collection(db, 'tasks'));
        batch.set(taskRef, {
          leadId: id,
          title: taskTitle,
          assignedTo: taskAssignedTo,
          dueDate: taskDueDate,
          createdBy: profile?.uid,
          createdAt: serverTimestamp(),
          completed: false
        });
      }
    });

    try {
      await batch.commit();
      setIsStatusModalOpen(false);
      setStatusUpdate({ 
        leadIds: [], 
        status: '', 
        notes: '',
        createTask: false,
        taskTitle: '',
        taskDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        taskAssignedTo: ''
      });
      if (leadIds.length > 1) setSelectedLeadIds([]);
      showToast('Status updated successfully.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/status-update');
    }
  };

  const handleLostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLostReason || lostLeadIds.length === 0) return;

    const batch = writeBatch(db);
    lostLeadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        status: 'lost', 
        lostReason: selectedLostReason, 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'lost',
          notes: `Reason: ${selectedLostReason}. ${lostNotes}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    });

    try {
      await batch.commit();
      setIsLostModalOpen(false);
      setLostLeadIds([]);
      setSelectedLostReason('');
      setLostNotes('');
      if (lostLeadIds.length > 1) setSelectedLeadIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/lost-status');
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason || !returnLeadId) return;

    try {
      await updateDoc(doc(db, 'leads', returnLeadId), {
        smId: '',
        status: 'returned_to_vendor',
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'returned_to_vendor',
          notes: `Returned by SM: ${returnReason}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
      showToast('Lead returned to vendor successfully.', 'success');
      setIsReturnModalOpen(false);
      setReturnLeadId('');
      setReturnReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${returnLeadId}`);
    }
  };

  const handleAssignSM = async (leadId: string, smId: string) => {
    try {
      const selectedSM = sms.find(s => s.uid === smId);
      await updateDoc(doc(db, 'leads', leadId), { 
        smId, 
        status: 'assigned', 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'assigned',
          notes: `Assigned to SM: ${selectedSM?.displayName || 'Unknown'}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedLeadIds.length === 0) return;
    
    if (status === 'lost') {
      setLostLeadIds(selectedLeadIds);
      setIsLostModalOpen(true);
      return;
    }

    setStatusUpdate({ 
      leadIds: selectedLeadIds, 
      status, 
      notes: '',
      createTask: false,
      taskTitle: '',
      taskDueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      taskAssignedTo: ''
    });
    setIsStatusModalOpen(true);
  };

  const handleBulkAssignSM = async (smId: string) => {
    if (selectedLeadIds.length === 0 || !smId) return;
    const selectedSM = sms.find(s => s.uid === smId);
    const batch = writeBatch(db);
    selectedLeadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        smId, 
        status: 'assigned', 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'assigned',
          notes: `Bulk assigned to SM: ${selectedSM?.displayName || 'Unknown'}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    });
    try {
      await batch.commit();
      setSelectedLeadIds([]);
      showToast('Bulk SM assignment successful!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/bulk-assign');
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const handleAddFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || (!feedback && !feedbackRecordingFile && !feedbackCloudUrl)) return;

    try {
      let recordingUrl = feedbackCloudUrl;
      let analysis = null;

      if (feedbackRecordingFile) {
        setIsUploadingFeedbackRecording(true);
        const storageRef = ref(storage, `recordings/${Date.now()}_${feedbackRecordingFile.name}`);
        const snapshot = await uploadBytes(storageRef, feedbackRecordingFile);
        recordingUrl = await getDownloadURL(snapshot.ref);

        // Analyze feedback recording if possible
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(feedbackRecordingFile);
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = error => reject(error);
          });
          analysis = await analyzeCallRecording(base64, feedbackRecordingFile.type || 'audio/mp3');
        } catch (err) {
          console.error("Feedback recording analysis failed", err);
        }
        
        setIsUploadingFeedbackRecording(false);
      } else if (feedbackCloudUrl) {
        try {
          analysis = await analyzeCallRecordingUrl(feedbackCloudUrl);
        } catch (err) {
          console.error("Feedback cloud URL analysis failed", err);
        }
      }

      const leadRef = doc(db, 'leads', selectedLead.id);
      
      const updateData: any = { updatedAt: serverTimestamp() };
      
      if (isSM || isAdmin) {
        if (feedback) updateData.smFeedback = feedback;
      } else if (isPartner || isVendor) {
        if (feedback) {
          updateData.partnerFeedback = arrayUnion(`${new Date().toLocaleString()}: ${feedback}`);
        }
      }

      if (recordingUrl) {
        updateData.additionalRecordings = arrayUnion({
          url: recordingUrl,
          addedAt: new Date().toISOString(),
          addedBy: profile?.displayName || 'Unknown',
          analysis: analysis
        });
      }

      // Update lead priority and tags if analysis found something new
      if (analysis) {
        if (analysis.priority) updateData.priority = analysis.priority;
        if (analysis.tags) updateData.tags = arrayUnion(...analysis.tags);
        // Also update main call analysis if it doesn't exist yet
        if (!selectedLead.callAnalysis) {
          updateData.callAnalysis = analysis;
        }
      }

      await updateDoc(leadRef, updateData);
      
      setFeedback('');
      setFeedbackRecordingFile(null);
      setFeedbackCloudUrl('');
      // Update local state to reflect changes without closing the slide-over
      setSelectedLead((prev: any) => ({ ...prev, ...updateData }));
      showToast('Feedback and analysis saved successfully.', 'success');
    } catch (error) {
      setIsUploadingFeedbackRecording(false);
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleGetFollowUpSuggestions = async (lead: any) => {
    setIsSuggestingFollowUps(true);
    try {
      const result = await suggestFollowUpReminders(lead);
      setFollowUpSuggestions(result.suggestions || []);
    } catch (error) {
      console.error('Error getting follow-up suggestions:', error);
      showToast('Failed to get AI follow-up suggestions.', 'error');
    } finally {
      setIsSuggestingFollowUps(false);
    }
  };

  const handleScheduleSuggestion = async (suggestion: any, lead: any) => {
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (suggestion.suggestedDaysFromNow || 1));
      
      await addDoc(collection(db, 'tasks'), {
        leadId: lead.id,
        leadName: lead.customerName,
        title: suggestion.title,
        description: suggestion.description,
        type: suggestion.type || 'call',
        dueDate: dueDate.toISOString(),
        status: 'pending',
        priority: lead.priority || 'Medium',
        createdAt: serverTimestamp(),
        createdBy: profile?.uid,
        assignedTo: lead.smId || profile?.uid
      });
      
      showToast('Follow-up scheduled successfully!', 'success');
      setFollowUpSuggestions(prev => prev.filter(s => s !== suggestion));
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const filteredLeads = leads.filter(lead => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!lead.customerName?.toLowerCase().includes(searchLower) && 
          !lead.enquiryId?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    if (filters.projectId && lead.projectId !== filters.projectId) return false;
    if (filters.vendorId && lead.partnerId !== filters.vendorId) return false;
    if (filters.smId && lead.smId !== filters.smId) return false;
    if (filters.status && lead.status !== filters.status) return false;
    if (filters.agencyId && lead.agencyId !== filters.agencyId) return false;
    if (filters.sourceId && lead.sourceId !== filters.sourceId) return false;
    if (filters.subsourceId && lead.subsourceId !== filters.subsourceId) return false;
    
    if (filters.dateFrom || filters.dateTo) {
      const leadDate = lead.createdAt?.toDate ? lead.createdAt.toDate() : new Date(lead.createdAt);
      if (filters.dateFrom && leadDate < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && leadDate > new Date(filters.dateTo + 'T23:59:59')) return false;
    }
    
    if (filters.scoreMin || filters.scoreMax) {
      const score = calculateLeadScore(lead).total;
      if (filters.scoreMin && score < Number(filters.scoreMin)) return false;
      if (filters.scoreMax && score > Number(filters.scoreMax)) return false;
    }
    
    if (filters.taskDateFrom || filters.taskDateTo) {
      const leadTasks = allTasks.filter(t => t.leadId === lead.id);
      const hasMatchingTask = leadTasks.some(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        if (filters.taskDateFrom && taskDate < new Date(filters.taskDateFrom)) return false;
        if (filters.taskDateTo && taskDate > new Date(filters.taskDateTo + 'T23:59:59')) return false;
        return true;
      });
      if (!hasMatchingTask) return false;
    }

    if (filters.tags) {
      const tagSearch = filters.tags.toLowerCase();
      const leadTags = lead.tags || [];
      if (!leadTags.some((tag: string) => tag.toLowerCase().includes(tagSearch))) {
        return false;
      }
    }

    return true;
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    let valA, valB;
    switch (sortConfig.key) {
      case 'priority':
        const priorityMap: { [key: string]: number } = { 'High': 3, 'Medium': 2, 'Low': 1 };
        valA = priorityMap[a.priority] || 0;
        valB = priorityMap[b.priority] || 0;
        break;
      case 'score':
        valA = calculateLeadScore(a).total;
        valB = calculateLeadScore(b).total;
        break;
      case 'date':
        valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        break;
      case 'status':
        valA = a.status;
        valB = b.status;
        break;
      case 'customer':
        valA = a.customerName?.toLowerCase();
        valB = b.customerName?.toLowerCase();
        break;
      default:
        valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
    }
    
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleExportLeads = () => {
    const exportData = sortedLeads.map(lead => {
      const project = projects.find(p => p.id === lead.projectId);
      const sm = sms.find(s => s.uid === lead.smId);
      const partner = partners.find(p => p.uid === lead.partnerId);
      const score = calculateLeadScore(lead).total;

      return {
        'Enquiry ID': lead.enquiryId || '',
        'Project': project ? project.name : (lead.projectId || ''),
        'Customer Name': lead.customerName || '',
        'Customer Phone': lead.customerPhone || '',
        'Budget': lead.budget || 0,
        'Possession': lead.possession || '',
        'Status': lead.status || '',
        'Score': score,
        'Assigned SM': sm ? sm.displayName : 'Unassigned',
        'Partner/Vendor': partner ? partner.displayName : 'Unassigned',
        'Vendor Notes': lead.vendorNotes || '',
        'Partner Feedback': lead.partnerFeedback ? lead.partnerFeedback.join(' | ') : '',
        'SM General Feedback': lead.smFeedback || '',
        'Created At': lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleString() : new Date(lead.createdAt).toLocaleString()
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const myLeadsCount = leads.filter(l => l.smId === profile.uid).length;
  const pendingLeadsCount = leads.filter(l => l.smId === profile.uid && l.status === 'new').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">Lead Management</h1>
          <p className="text-xs md:text-base text-gray-500 mt-1">
            {isSM ? `Manage your assigned leads and track progress.` : `Track and manage leads across all projects.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {isSM && (
            <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto mb-1 md:mb-0 md:mr-4">
              <button
                onClick={() => setSmViewMode('my')}
                className={`flex-1 md:flex-none px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'my' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                My Leads ({myLeadsCount})
              </button>
              <button
                onClick={() => setSmViewMode('all')}
                className={`flex-1 md:flex-none px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Leads
              </button>
            </div>
          )}
          <div className="flex overflow-x-auto sm:flex-wrap gap-2 w-full md:w-auto pb-1 md:pb-0 scrollbar-hide snap-x">
            {selectedLeadIds.length > 0 && (
              <button
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-red-50 text-red-600 border border-red-100 px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-red-100 transition-all shadow-sm text-[11px] md:text-sm"
              >
                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span>Delete {selectedLeadIds.length} leads</span>
              </button>
            )}
            <button
              onClick={handleExportLeads}
              className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-white border border-gray-200 text-gray-900 px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-[11px] md:text-sm"
            >
              <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span>Export</span>
            </button>
            {(isPartner || isVendor || isAdmin) && (
              <>
                <button
                  onClick={() => setIsIntegrationModalOpen(true)}
                  className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-white border border-gray-200 text-gray-900 px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-[11px] md:text-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>Integrations</span>
                </button>
                <button
                  onClick={() => setIsHierarchyModalOpen(true)}
                  className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-white border border-gray-200 text-gray-900 px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-[11px] md:text-sm"
                >
                  <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>Hierarchy</span>
                </button>
                <button
                  onClick={() => {
                    setBulkUploadProject('');
                    setBulkUploadVendor('');
                    setIsBulkModalOpen(true);
                  }}
                  className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-white border border-gray-200 text-gray-900 px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-[11px] md:text-sm"
                >
                  <Upload className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>Bulk Upload</span>
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="snap-start shrink-0 flex items-center justify-center gap-1.5 md:gap-2 bg-gray-900 text-white px-3 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm md:shadow-lg hover:shadow-xl active:scale-95 text-[11px] md:text-sm"
                >
                  <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span>Drop Lead</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {isSM && smViewMode === 'my' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-6"
        >
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-3 md:p-6 rounded-xl md:rounded-3xl text-white shadow-md md:shadow-xl shadow-blue-200/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-white/10 rounded-full blur-2xl -mr-8 md:-mr-10 -mt-8 md:-mt-10 transition-transform group-hover:scale-110"></div>
            <p className="text-blue-100 text-[10px] md:text-sm font-bold uppercase tracking-wider mb-0.5 md:mb-1">My Total Leads</p>
            <p className="text-2xl md:text-4xl font-black">{myLeadsCount}</p>
          </div>
          <div className="bg-white p-3 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-[10px] md:text-sm font-bold uppercase tracking-wider mb-0.5 md:mb-1">New / Pending</p>
            <p className="text-2xl md:text-4xl font-black text-gray-900">{pendingLeadsCount}</p>
          </div>
          <div className="bg-white p-3 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-[10px] md:text-sm font-bold uppercase tracking-wider mb-0.5 md:mb-1">Converted</p>
            <p className="text-2xl md:text-4xl font-black text-green-600">{leads.filter(l => l.smId === profile.uid && l.status === 'converted').length}</p>
          </div>
          <div className="bg-white p-3 md:p-6 rounded-xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-[10px] md:text-sm font-bold uppercase tracking-wider mb-0.5 md:mb-1">Conversion Rate</p>
            <p className="text-2xl md:text-4xl font-black text-blue-600">
              {myLeadsCount > 0 ? ((leads.filter(l => l.smId === profile.uid && l.status === 'converted').length / myLeadsCount) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </motion.div>
      )}

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedLeadIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-24 md:bottom-8 left-1/2 bg-gray-900 text-white px-3 md:px-6 py-2.5 md:py-4 rounded-xl md:rounded-2xl shadow-2xl flex flex-wrap items-center gap-3 md:gap-6 z-50 w-[94%] md:w-auto justify-center md:justify-start"
          >
            <div className="flex items-center gap-2 md:gap-3 pr-3 md:pr-6 border-r border-gray-700">
              <div className="bg-blue-500 text-white w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold">
                {selectedLeadIds.length}
              </div>
              <span className="text-xs md:text-sm font-medium hidden sm:inline">Leads Selected</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 md:gap-4">
              {(isAdmin || isSM) && (
                <div className="flex items-center gap-1 md:gap-2">
                  <Check className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400 hidden sm:block" />
                  <select
                    onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-[10px] md:text-sm rounded-md md:rounded-lg px-1.5 md:px-3 py-1 md:py-1.5 focus:ring-2 focus:ring-blue-500 outline-none max-w-[90px] md:max-w-none"
                    value=""
                  >
                    <option value="" disabled>Status</option>
                    {settings.statuses.map((s: string) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              )}

              {(isAdmin || isSM || isPartner || isVendor) && (
                <div className="flex items-center gap-1 md:gap-2">
                  <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400 hidden sm:block" />
                  <select
                    onChange={(e) => handleBulkAssignSM(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-[10px] md:text-sm rounded-md md:rounded-lg px-1.5 md:px-3 py-1 md:py-1.5 focus:ring-2 focus:ring-blue-500 outline-none max-w-[90px] md:max-w-none"
                    value=""
                  >
                    <option value="" disabled>Assign SM</option>
                    {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                  </select>
                </div>
              )}

              <button
                onClick={() => setSelectedLeadIds([])}
                className="text-[10px] md:text-sm text-gray-400 hover:text-white transition-colors ml-0.5 md:ml-2 font-bold"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters & Search */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white p-2 border border-gray-100 shadow-sm rounded-xl md:rounded-2xl"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-1.5 md:gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5" />
            <input
              type="text"
              placeholder="Search leads by name or ID"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-9 pr-4 py-2 md:py-3 bg-gray-50/50 border border-gray-100 rounded-lg md:rounded-xl focus:ring-2 focus:ring-gray-900 focus:bg-white outline-none transition-all text-xs md:text-base"
            />
          </div>
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center justify-center gap-2 px-4 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl border transition-all font-medium text-xs md:text-base ${
              isFilterOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
            Filters
          </button>
        </div>

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 mt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Project</label>
              <select
                value={filters.projectId}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            {(isAdmin || isSM) && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vendor/Partner</label>
                <select
                  value={filters.vendorId}
                  onChange={(e) => setFilters({ ...filters, vendorId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All Vendors</option>
                  {partners.map(p => <option key={p.uid} value={p.uid}>{p.companyName || p.displayName}</option>)}
                </select>
              </div>
            )}

            {(isAdmin || isVendor || isPartner) && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sales Manager</label>
                <select
                  value={filters.smId}
                  onChange={(e) => setFilters({ ...filters, smId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All SMs</option>
                  {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Statuses</option>
                {settings.statuses.map((s: string) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Agency</label>
              <select
                value={filters.agencyId}
                onChange={(e) => setFilters({ ...filters, agencyId: e.target.value, sourceId: '', subsourceId: '' })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Agencies</option>
                {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Source</label>
              <select
                value={filters.sourceId}
                onChange={(e) => setFilters({ ...filters, sourceId: e.target.value, subsourceId: '' })}
                disabled={!filters.agencyId}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
              >
                <option value="">All Sources</option>
                {sources.filter(s => s.agencyId === filters.agencyId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subsource</label>
              <select
                value={filters.subsourceId}
                onChange={(e) => setFilters({ ...filters, subsourceId: e.target.value })}
                disabled={!filters.sourceId}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
              >
                <option value="">All Subsources</option>
                {subsources.filter(ss => ss.sourceId === filters.sourceId).map(ss => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Lead Date Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Score Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.scoreMin}
                  onChange={(e) => setFilters({ ...filters, scoreMin: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.scoreMax}
                  onChange={(e) => setFilters({ ...filters, scoreMax: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Task Followup Date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.taskDateFrom}
                  onChange={(e) => setFilters({ ...filters, taskDateFrom: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={filters.taskDateTo}
                  onChange={(e) => setFilters({ ...filters, taskDateTo: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tags</label>
              <input
                type="text"
                placeholder="Search tags..."
                value={filters.tags}
                onChange={(e) => setFilters({ ...filters, tags: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  search: '', projectId: '', vendorId: '', smId: '', agencyId: '', sourceId: '', subsourceId: '', dateFrom: '', dateTo: '', status: '', scoreMin: '', scoreMax: '', taskDateFrom: '', taskDateTo: '', tags: ''
                })}
                className="w-full px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all"
              >
                Clear Filters
              </button>
            </div>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>

      {/* AI Intelligence Summary Bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 md:mt-6 p-4 md:p-6 bg-gradient-to-r from-gray-900 via-indigo-950 to-indigo-900 rounded-2xl md:rounded-3xl shadow-lg relative overflow-hidden group"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-white/10 transition-all duration-500"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl group-hover:bg-indigo-500/10 transition-all duration-500"></div>

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4 md:gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 md:gap-3 mb-1.5 md:mb-2">
              <div className="p-1.5 md:p-2 bg-indigo-500/20 rounded-lg md:rounded-xl backdrop-blur-md border border-indigo-400/20">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-indigo-300" />
              </div>
              <h3 className="text-base md:text-lg font-black text-white tracking-tight">Lead Portfolio Summary</h3>
            </div>
            {!collectiveCallSummary && !isGeneratingCollectiveSummary ? (
              <p className="text-indigo-200/60 text-xs md:text-sm max-w-xl">
                Get a high-level intelligence summary of all {sortedLeads.length} leads in the current view. 
                AI will analyze common themes, customer sentiment, and strategic blockers.
              </p>
            ) : isGeneratingCollectiveSummary ? (
              <div className="flex items-center gap-3 py-1.5 md:py-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                </div>
                <p className="text-indigo-300 text-xs text-sm font-bold uppercase tracking-widest animate-pulse">Scanning voice intelligence & history...</p>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                <p className="text-indigo-50 text-xs md:text-sm leading-relaxed border-l-2 border-indigo-500/50 pl-3 md:pl-4 py-1 italic">
                  "{collectiveCallSummary.summary}"
                </p>
                <div className="flex flex-wrap gap-1.5 md:gap-2">
                  {collectiveCallSummary.topPainPoints?.map((pt: string, i: number) => (
                    <span key={i} className="px-2 md:px-3 py-0.5 md:py-1 bg-white/5 border border-white/10 rounded-full text-[9px] md:text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                      {pt}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-start md:items-end w-full md:w-auto gap-2 md:gap-3 md:min-w-[200px]">
            <button
              onClick={handleGenerateCollectiveSummary}
              disabled={isGeneratingCollectiveSummary || sortedLeads.length === 0}
              className="w-full md:w-auto px-4 md:px-6 py-2.5 md:py-3 bg-white text-indigo-900 rounded-xl md:rounded-2xl font-black text-[10px] md:text-sm uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-md md:shadow-xl shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2 group/btn"
            >
              <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${isGeneratingCollectiveSummary ? 'animate-spin' : 'group-hover/btn:rotate-180 transition-transform duration-500'}`} />
              {collectiveCallSummary ? 'Update Intelligence' : 'Generate Summary'}
            </button>
            {collectiveCallSummary?.strategicAdvice && (
              <div className="bg-indigo-400/10 border border-indigo-400/20 rounded-xl p-2.5 md:p-3 w-full md:max-w-[280px]">
                <div className="flex items-center gap-1.5 md:gap-2 mb-1 text-indigo-300">
                  <Bot className="w-3 h-3" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-tighter">Strategic Advice</span>
                </div>
                <p className="text-[10px] md:text-[11px] text-indigo-100 font-medium leading-tight">{collectiveCallSummary.strategicAdvice}</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Leads Table & Mobile List */}
      <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-12 mt-4 md:mt-6">
        {/* Mobile View */}
        <div className="md:hidden block">
          <div className="divide-y divide-gray-100">
            {sortedLeads.length > 0 ? (
              sortedLeads.map((lead) => (
                <div 
                  key={lead.id} 
                  className={`p-3 space-y-2 relative hover:bg-gray-50 transition-colors ${selectedLeadIds.includes(lead.id) ? 'bg-blue-50/30' : ''}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-start gap-2">
                      <div className="pt-0.5">
                        <input 
                          type="checkbox" 
                          className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => toggleSelectLead(lead.id)}
                        />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="font-bold text-gray-900 text-xs sm:text-sm leading-tight truncate max-w-[140px]">{lead.customerName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shrink-0 ${
                            lead.priority === 'High' ? 'bg-red-100 text-red-700' :
                            lead.priority === 'Medium' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {lead.priority || 'Medium'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono mb-1">{lead.enquiryId}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider w-fit ${
                            lead.status === 'converted' ? 'bg-green-100 text-green-700' :
                            lead.status === 'lost' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {lead.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-semibold text-gray-600 truncate max-w-[100px]">
                            {projects.find(p => p.id === lead.projectId)?.name || 'Unknown Project'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Score (if available) */}
                    {lead.callAnalysis?.score && (
                      <div className="shrink-0 flex flex-col items-center ml-1">
                        <div className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center relative bg-white shadow-sm">
                          <span className="absolute text-[8px] font-black">{lead.callAnalysis?.score}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Footer Stats */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-50 mt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 text-[9px] text-gray-500 font-medium">
                        <User className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[70px]">
                          {sms.find(sm => sm.uid === lead.assignedTo)?.displayName || 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 text-[9px] text-gray-500 font-medium">
                        <Calendar className="w-2.5 h-2.5" />
                        {lead.createdAt?.toDate ? new Date(lead.createdAt.toDate()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }) : 'N/A'}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button 
                        onClick={() => setSelectedLead(lead)}
                        className="p-1 bg-gray-50 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      {(isSM || isAdmin) && (
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                          className="text-[9px] font-bold bg-gray-900 text-white border-none rounded-md px-1.5 py-1 cursor-pointer hover:bg-gray-800 transition-all appearance-none ml-0.5 w-[72px] truncate"
                        >
                          {settings.statuses.map((s: string) => (
                            <option key={s} value={s} className="bg-white text-gray-900">{s.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-gray-500 text-xs">
                No leads match your criteria
              </div>
            )}
          </div>
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-5">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-1">
                    Enquiry ID
                    {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('customer')}>
                  <div className="flex items-center gap-1">
                    Customer
                    {sortConfig.key === 'customer' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('priority')}>
                  <div className="flex items-center gap-1">
                    Priority
                    {sortConfig.key === 'priority' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Agency / Source</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Project</th>
                {(isAdmin || isSM) && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Partner/Vendor</th>}
                {isSM && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Vendor Notes</th>}
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('score')}>
                  <div className="flex items-center gap-1">
                    Score
                    {sortConfig.key === 'score' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Assigned SM</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedLeads.map((lead) => (
                <tr key={lead.id} className={`hover:bg-gray-50 transition-colors ${selectedLeadIds.includes(lead.id) ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleSelectLead(lead.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">{lead.enquiryId}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">{lead.customerName}</p>
                    <p className="text-xs text-gray-500">{lead.customerPhone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      lead.priority === 'High' ? 'bg-red-100 text-red-700' :
                      lead.priority === 'Medium' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {lead.priority || 'Medium'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-gray-900 truncate max-w-[150px]" title={agencies.find(a => a.id === lead.agencyId)?.name || 'Direct'}>
                        {agencies.find(a => a.id === lead.agencyId)?.name || 'Direct'}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium truncate max-w-[150px]">
                        {sources.find(s => s.id === lead.sourceId)?.name || '-'} {subsources.find(ss => ss.id === lead.subsourceId)?.name ? `/ ${subsources.find(ss => ss.id === lead.subsourceId)?.name}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">
                      {projects.find(p => p.id === lead.projectId)?.name || 'Unknown Project'}
                    </span>
                  </td>
                  {(isAdmin || isSM) && (
                    <td className="px-6 py-4">
                      {(() => {
                        const partner = partners.find(p => p.uid === lead.partnerId);
                        return (
                          <p className="text-sm font-bold text-gray-900">{partner?.companyName || partner?.displayName || lead.partnerName || 'Direct'}</p>
                        );
                      })()}
                    </td>
                  )}
                  {isSM && (
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 line-clamp-2 max-w-[200px]" title={lead.vendorNotes}>
                        {lead.vendorNotes || 'No notes'}
                      </p>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    {(() => {
                      const score = calculateLeadScore(lead).total;
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full border-2 border-gray-100 flex items-center justify-center relative">
                            <svg className="w-full h-full -rotate-90">
                              <circle
                                cx="20" cy="20" r="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="text-gray-100"
                              />
                              <circle
                                cx="20" cy="20" r="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeDasharray={100}
                                strokeDashoffset={100 - score}
                                className={`${
                                  score > 70 ? 'text-green-500' :
                                  score > 40 ? 'text-blue-500' :
                                  'text-orange-500'
                                }`}
                              />
                            </svg>
                            <span className="absolute text-[10px] font-black">{score}</span>
                          </div>
                          {lead.callAnalysis?.priority && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              lead.callAnalysis.priority === 'High' ? 'bg-red-100 text-red-700' :
                              lead.callAnalysis.priority === 'Medium' ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {lead.callAnalysis.priority}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${
                        lead.status === 'converted' ? 'bg-green-100 text-green-700' :
                        lead.status === 'lost' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                      {lead.status === 'lost' && lead.lostReason && (
                        <span className="text-[10px] text-red-500 font-medium italic">Reason: {lead.lostReason}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isAdmin || isPartner || isVendor ? (
                      <select
                        value={lead.smId || ''}
                        onChange={(e) => handleAssignSM(lead.id, e.target.value)}
                        className="text-sm bg-gray-50 border border-gray-200 rounded p-1"
                      >
                        <option value="">Unassigned</option>
                        {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-600">
                        {sms.find(s => s.uid === lead.smId)?.displayName || (lead.smId ? 'Assigned' : 'Unassigned')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                        <a 
                          href={`tel:${lead.customerPhone}`}
                          className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-all"
                          title="Call"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                        <a 
                          href={`sms:${lead.customerPhone}`}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                          title="SMS"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </a>
                        <a 
                          href={`https://wa.me/${lead.customerPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded transition-all"
                          title="WhatsApp"
                        >
                          <Send className="w-4 h-4" />
                        </a>
                        <a 
                          href={`mailto:${lead.customerEmail}`}
                          className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-all"
                          title="Email"
                        >
                          <Mail className="w-4 h-4" />
                        </a>
                      </div>
                      <button 
                        onClick={() => setSelectedLead(lead)}
                        className="p-2 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                        title="View Feedback & Notes"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                      {(isAdmin || isSM || isVendorEditor || isVendorManager) && (
                        <button 
                          onClick={() => {
                            setEditLeadData(lead);
                            setIsEditModalOpen(true);
                          }}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Lead"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                      )}
                      {(isSM || isAdmin) && lead.smId && (
                        <button 
                          onClick={() => {
                            setReturnLeadId(lead.id);
                            setIsReturnModalOpen(true);
                          }}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                          title="Return to Vendor"
                        >
                          <CornerUpLeft className="w-5 h-5" />
                        </button>
                      )}
                      {(isAdmin || isVendorManager) && (
                        <button 
                          onClick={() => confirmDeleteLead(lead.id)}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Lead"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      {(isSM || isAdmin) && (
                        <div className="relative group">
                          <select
                            value={lead.status}
                            onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                            className="text-xs font-bold bg-gray-900 text-white border-none rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-800 transition-all appearance-none"
                          >
                            {settings.statuses.map((s: string) => (
                              <option key={s} value={s} className="bg-white text-gray-900">{s.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Plus className="w-3 h-3 text-white/50" />
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Lead Modal */}
      <AnimatePresence>
        {isEditModalOpen && editLeadData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Lead</h2>
            <form onSubmit={handleEditLeadSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={editLeadData.customerName}
                    onChange={(e) => setEditLeadData({ ...editLeadData, customerName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Customer Phone</label>
                  <input
                    type="tel"
                    required
                    value={editLeadData.customerPhone}
                    onChange={(e) => setEditLeadData({ ...editLeadData, customerPhone: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={editLeadData.customerEmail || ''}
                    onChange={(e) => setEditLeadData({ ...editLeadData, customerEmail: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Gender</label>
                  <select
                    value={editLeadData.gender || ''}
                    onChange={(e) => setEditLeadData({ ...editLeadData, gender: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Living Location</label>
                  <input
                    type="text"
                    value={editLeadData.livingLocation || ''}
                    onChange={(e) => setEditLeadData({ ...editLeadData, livingLocation: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Client Type</label>
                  <select
                    value={editLeadData.clientType || 'end_user'}
                    onChange={(e) => setEditLeadData({ ...editLeadData, clientType: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="end_user">End User</option>
                    <option value="investor">Investor</option>
                  </select>
                </div>

                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="col-span-1 md:col-span-3">
                    <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Lead Source Hierarchy</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Agency</label>
                    <select
                      value={editLeadData.agencyId || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, agencyId: e.target.value, sourceId: '', subsourceId: '' })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                    >
                      <option value="">Select Agency</option>
                      {agencies.filter(a => a.partnerId === (editLeadData.partnerId || profile?.vendorCompanyId || profile?.uid)).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Source</label>
                    <select
                      value={editLeadData.sourceId || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, sourceId: e.target.value, subsourceId: '' })}
                      disabled={!editLeadData.agencyId}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all disabled:opacity-50"
                    >
                      <option value="">Select Source</option>
                      {sources.filter(s => s.agencyId === editLeadData.agencyId).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Subsource</label>
                    <select
                      value={editLeadData.subsourceId || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, subsourceId: e.target.value })}
                      disabled={!editLeadData.sourceId}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all disabled:opacity-50"
                    >
                      <option value="">Select Subsource</option>
                      {subsources.filter(ss => ss.sourceId === editLeadData.sourceId).map(ss => (
                        <option key={ss.id} value={ss.id}>{ss.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Professional Details</h3>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Company Name</label>
                    <input
                      type="text"
                      value={editLeadData.companyName || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, companyName: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Profession</label>
                    <input
                      type="text"
                      value={editLeadData.profession || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, profession: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Designation</label>
                    <input
                      type="text"
                      value={editLeadData.designation || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, designation: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">LinkedIn Profile</label>
                    <input
                      type="url"
                      value={editLeadData.linkedinProfile || ''}
                      onChange={(e) => setEditLeadData({ ...editLeadData, linkedinProfile: e.target.value })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Budget (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editLeadData.budget}
                    onChange={(e) => setEditLeadData({ ...editLeadData, budget: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Possession Timeline</label>
                  <select
                    required
                    value={editLeadData.possession}
                    onChange={(e) => setEditLeadData({ ...editLeadData, possession: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="">Select timeline...</option>
                    <option value="immediate">Immediate</option>
                    <option value="3_months">Within 3 Months</option>
                    <option value="6_months">Within 6 Months</option>
                    <option value="1_year">Within 1 Year</option>
                    <option value="1_year_plus">More than 1 Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Priority</label>
                  <select
                    required
                    value={editLeadData.priority || 'Medium'}
                    onChange={(e) => setEditLeadData({ ...editLeadData, priority: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Tags</label>
                  <TagInput 
                    tags={editLeadData.tags || []} 
                    onChange={(tags) => setEditLeadData({ ...editLeadData, tags })} 
                    placeholder="Add tag and press Enter"
                  />
                </div>
                <div className="col-span-1 md:col-span-2 bg-gray-50 p-6 rounded-2xl border border-gray-200">
                  <label className="block text-sm font-bold text-gray-900 mb-4">Call Recording Analysis</label>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Upload New Recording</label>
                        <input
                          type="file"
                          accept="audio/mp3,audio/wav"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setRecordingFile(e.target.files[0]);
                              setEditLeadData({ ...editLeadData, callRecordingUrl: '' });
                            }
                          }}
                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Recording URL</label>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={editLeadData.callRecordingUrl || ''}
                          onChange={(e) => {
                            setEditLeadData({ ...editLeadData, callRecordingUrl: e.target.value });
                            setRecordingFile(null);
                          }}
                          className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none text-sm"
                        />
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleAnalyzeRecording('edit')}
                      disabled={isAnalyzing || (!editLeadData.callRecordingUrl && !recordingFile)}
                      className="w-full py-2.5 bg-blue-50 text-blue-600 font-bold rounded-xl text-sm hover:bg-blue-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Analyzing with Gemini...
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4" />
                          Analyze Recording
                        </>
                      )}
                    </button>

                    {editLeadData.callAnalysis && (
                      <div className="mt-4 p-4 bg-white rounded-xl border border-gray-200 shadow-sm space-y-3">
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">AI Analysis Result</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            editLeadData.callAnalysis.priority === 'High' ? 'bg-red-100 text-red-600' : 
                            editLeadData.callAnalysis.priority === 'Medium' ? 'bg-orange-100 text-orange-600' : 
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {editLeadData.callAnalysis.priority} Priority
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <p><span className="font-bold text-gray-700">Summary:</span> {editLeadData.callAnalysis.summary}</p>
                          <p><span className="font-bold text-gray-700">Suggested Score:</span> {editLeadData.callAnalysis.suggestedScore}/100</p>
                          <div>
                            <span className="font-bold text-gray-700">Pain Points:</span>
                            <ul className="list-disc pl-5 mt-1 text-gray-600 text-xs space-y-1">
                              {editLeadData.callAnalysis.painPoints?.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
                            </ul>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const aiTags = editLeadData.callAnalysis.tags || [];
                            const currentTags = editLeadData.tags || [];
                            const mergedTags = [...new Set([...currentTags, ...aiTags])];
                            setEditLeadData({ ...editLeadData, tags: mergedTags });
                            showToast('AI tags applied to lead!', 'success');
                          }}
                          className="w-full py-1.5 bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-100 transition-all"
                        >
                          Apply AI Tags
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditLeadData(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lost Reason Modal */}
      <AnimatePresence>
        {isLostModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Mark as Lost</h2>
            <p className="text-sm text-gray-500 mb-6">Please select a reason for marking {lostLeadIds.length > 1 ? 'these leads' : 'this lead'} as lost.</p>
            
            <form onSubmit={handleLostSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason</label>
                <select
                  required
                  value={selectedLostReason}
                  onChange={(e) => setSelectedLostReason(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Select Reason</option>
                  {settings.lostReasons.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Additional Notes</label>
                <textarea
                  rows={3}
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Any extra details about why this lead was lost..."
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setIsLostModalOpen(false);
                    setLostLeadIds([]);
                    setSelectedLostReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                >
                  Confirm Lost
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return to Vendor Modal */}
      <AnimatePresence>
        {isReturnModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Return Lead to Vendor</h2>
            <p className="text-sm text-gray-500 mb-6">Please provide a reason for returning this lead. It will be unassigned from you and its status reset to 'New'.</p>
            
            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason for Return</label>
                <textarea
                  required
                  rows={4}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="e.g. Unable to connect after 5 attempts, invalid number..."
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700"
                >
                  Return Lead
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Delete Lead?</h2>
                <p className="text-sm text-gray-500 mb-8">
                  Are you sure you want to delete this lead? This action cannot be undone.
                </p>
                <div className="flex gap-4 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setLeadToDelete(null);
                    }}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteLead}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Delete Lead
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Integrations Modal */}
      <AnimatePresence>
        {isIntegrationModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl"
            >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Live Integrations</h2>
              <button onClick={() => setIsIntegrationModalOpen(false)} className="text-gray-400 hover:text-gray-900">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Google Sheets Sync</h3>
                    <p className="text-xs text-gray-500">Automatically pull leads from a published Google Sheet.</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 mb-4 space-y-2">
                  <p className="font-bold text-gray-900 text-xs uppercase">How to set up:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-xs">
                    <li>Open your Google Sheet containing leads.</li>
                    <li>Go to <strong>File &gt; Share &gt; Publish to web</strong>.</li>
                    <li>Select the specific sheet and choose <strong>Comma-separated values (.csv)</strong>.</li>
                    <li>Click <strong>Publish</strong> and paste the link below.</li>
                  </ol>
                  <p className="text-[10px] text-gray-500 mt-2">
                    * Required columns: <code className="bg-gray-200 px-1 rounded">enquiryId</code>, <code className="bg-gray-200 px-1 rounded">projectId</code>. Optional: <code className="bg-gray-200 px-1 rounded">customerName</code>, <code className="bg-gray-200 px-1 rounded">customerPhone</code>, <code className="bg-gray-200 px-1 rounded">budget</code>, <code className="bg-gray-200 px-1 rounded">possession</code>, <code className="bg-gray-200 px-1 rounded">vendorNotes</code>, <code className="bg-gray-200 px-1 rounded">callRecordingUrl</code>.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Link className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                    />
                  </div>
                  
                  <button
                    onClick={handleSyncSheet}
                    disabled={isSyncing || !sheetUrl}
                    className="w-full py-2 bg-green-600 text-white font-bold rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Sync Now
                      </>
                    )}
                  </button>
                </div>

                {syncResult && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-green-900">Sync Complete!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Added {syncResult.added} new leads. Skipped {syncResult.skipped} existing leads.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 opacity-75">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Zapier / Webhook API</h3>
                    <p className="text-xs text-gray-500">Push leads directly from other CRMs.</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  To push leads programmatically, you can use the Firebase Admin SDK or set up a Cloud Function. For now, use the Google Sheets sync above for a no-code live integration.
                </p>
              </div>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Upload Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bulk Upload Leads</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Project</label>
                <select
                  value={bulkUploadProject}
                  onChange={(e) => setBulkUploadProject(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                >
                  <option value="">Select a project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Vendor (Optional)</label>
                <select
                  value={bulkUploadVendor}
                  onChange={(e) => setBulkUploadVendor(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                >
                  <option value="">Default (Current User)</option>
                  {partners.map(p => <option key={p.uid} value={p.uid}>{p.companyName || p.displayName}</option>)}
                </select>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-6">
              Upload a CSV or Excel file with columns: <br/>
              <code className="bg-gray-100 px-1 rounded text-[10px]">enquiryId, customerName, customerPhone, budget, possession, vendorNotes, callRecordingUrl</code>
            </p>
            
            <div className="mb-6 flex justify-end">
              <button
                onClick={() => {
                  const csvContent = "data:text/csv;charset=utf-8,enquiryId,customerName,customerPhone,budget,possession,vendorNotes,callRecordingUrl\n123,John Doe,1234567890,1000000,immediate,Looking for 2BHK,https://example.com/recording.mp3";
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", "sample_leads.csv");
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Download Sample CSV
              </button>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-gray-900 transition-colors group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv,.xlsx,.xls" 
                onChange={handleBulkUpload}
              />
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-100">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-gray-900" />
              </div>
              <p className="text-sm font-bold text-gray-900">Click to upload file</p>
              <p className="text-xs text-gray-500 mt-1">CSV, XLSX or XLS (Max 5MB)</p>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Drop Lead Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Drop a New Lead</h2>
            <form onSubmit={handleAddLead} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Enquiry ID</label>
                <input
                  type="text"
                  required
                  value={newLead.enquiryId}
                  onChange={(e) => setNewLead({ ...newLead, enquiryId: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Project</label>
                <select
                  required
                  value={newLead.projectId}
                  onChange={(e) => setNewLead({ ...newLead, projectId: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Select Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {(isAdmin || isSM) && (
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assign to Partner/Vendor</label>
                  <select
                    required
                    value={newLead.partnerId}
                    onChange={(e) => setNewLead({ ...newLead, partnerId: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="">Select Partner/Vendor</option>
                    {partners.map(p => <option key={p.uid} value={p.uid}>{p.companyName || p.displayName}</option>)}
                  </select>
                </div>
              )}
              
              <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Agency</label>
                  <select
                    value={newLead.agencyId}
                    onChange={(e) => setNewLead({ ...newLead, agencyId: e.target.value, sourceId: '', subsourceId: '' })}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                  >
                    <option value="">Select Agency</option>
                    {agencies.filter(a => a.partnerId === (newLead.partnerId || profile?.vendorCompanyId || profile?.uid)).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Source</label>
                  <select
                    value={newLead.sourceId}
                    onChange={(e) => setNewLead({ ...newLead, sourceId: e.target.value, subsourceId: '' })}
                    disabled={!newLead.agencyId}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all disabled:opacity-50"
                  >
                    <option value="">Select Source</option>
                    {sources.filter(s => s.agencyId === newLead.agencyId).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Subsource</label>
                  <select
                    value={newLead.subsourceId}
                    onChange={(e) => setNewLead({ ...newLead, subsourceId: e.target.value })}
                    disabled={!newLead.sourceId}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all disabled:opacity-50"
                  >
                    <option value="">Select Subsource</option>
                    {subsources.filter(ss => ss.sourceId === newLead.sourceId).map(ss => (
                      <option key={ss.id} value={ss.id}>{ss.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Priority</label>
                <select
                  required
                  value={newLead.priority}
                  onChange={(e) => setNewLead({ ...newLead, priority: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={newLead.customerName}
                  onChange={(e) => setNewLead({ ...newLead, customerName: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={newLead.customerPhone}
                  onChange={(e) => setNewLead({ ...newLead, customerPhone: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newLead.customerEmail}
                  onChange={(e) => setNewLead({ ...newLead, customerEmail: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Gender</label>
                <select
                  value={newLead.gender}
                  onChange={(e) => setNewLead({ ...newLead, gender: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Living Location</label>
                <input
                  type="text"
                  value={newLead.livingLocation}
                  onChange={(e) => setNewLead({ ...newLead, livingLocation: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  placeholder="City/Area"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Client Type</label>
                <select
                  value={newLead.clientType}
                  onChange={(e) => setNewLead({ ...newLead, clientType: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="end_user">End User</option>
                  <option value="investor">Investor</option>
                </select>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="col-span-2">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Professional Details</h3>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={newLead.companyName}
                    onChange={(e) => setNewLead({ ...newLead, companyName: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Profession</label>
                  <input
                    type="text"
                    value={newLead.profession}
                    onChange={(e) => setNewLead({ ...newLead, profession: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={newLead.designation}
                    onChange={(e) => setNewLead({ ...newLead, designation: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">LinkedIn Profile</label>
                  <input
                    type="url"
                    value={newLead.linkedinProfile}
                    onChange={(e) => setNewLead({ ...newLead, linkedinProfile: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Budget (₹)</label>
                <input
                  type="number"
                  required
                  value={newLead.budget}
                  onChange={(e) => setNewLead({ ...newLead, budget: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Possession</label>
                <input
                  type="text"
                  placeholder="e.g. 2025"
                  value={newLead.possession}
                  onChange={(e) => setNewLead({ ...newLead, possession: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Vendor Notes (Initial Comments)</label>
                <textarea
                  rows={3}
                  value={newLead.vendorNotes}
                  onChange={(e) => setNewLead({ ...newLead, vendorNotes: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Any initial notes about this lead..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Tags</label>
                <TagInput 
                  tags={newLead.tags} 
                  onChange={(tags) => setNewLead({ ...newLead, tags })} 
                  placeholder="Add tag (e.g. budget-conscious) and press Enter"
                />
              </div>
              <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-sm font-bold text-gray-900 mb-2">Call Recording (Optional)</label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Upload File (MP3/WAV)</label>
                    <input
                      type="file"
                      accept="audio/mp3,audio/wav"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setRecordingFile(e.target.files[0]);
                          setNewLead({ ...newLead, callRecordingUrl: '' });
                        }
                      }}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-gray-200 flex-1"></div>
                    <span className="text-xs text-gray-400 font-bold uppercase">OR</span>
                    <div className="h-px bg-gray-200 flex-1"></div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cloud URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newLead.callRecordingUrl}
                      onChange={(e) => {
                        setNewLead({ ...newLead, callRecordingUrl: e.target.value });
                        setRecordingFile(null);
                      }}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none text-sm"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleAnalyzeRecording('new')}
                      disabled={isAnalyzing || (!newLead.callRecordingUrl && !recordingFile)}
                      className="w-full py-2 bg-blue-50 text-blue-600 font-bold rounded-lg text-sm hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Analyzing Recording...
                        </>
                      ) : (
                        'Analyze Recording'
                      )}
                    </button>
                  </div>
                  
                  {newLead.callAnalysis && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-900 mb-2">Analysis Results</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-bold text-gray-700">Priority:</span> <span className={`font-bold ${newLead.callAnalysis.priority === 'High' ? 'text-red-600' : newLead.callAnalysis.priority === 'Medium' ? 'text-orange-500' : 'text-blue-500'}`}>{newLead.callAnalysis.priority}</span></p>
                        <p><span className="font-bold text-gray-700">Suggested Score:</span> {newLead.callAnalysis.suggestedScore}</p>
                        <p><span className="font-bold text-gray-700">Summary:</span> {newLead.callAnalysis.summary}</p>
                        {newLead.callAnalysis.keyTakeaways && (
                          <p><span className="font-bold text-gray-700">Takeaways:</span> {newLead.callAnalysis.keyTakeaways}</p>
                        )}
                        <div>
                          <span className="font-bold text-gray-700">Pain Points:</span>
                          <ul className="list-disc pl-5 mt-1 text-gray-600">
                            {newLead.callAnalysis.painPoints?.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
                  Submit Lead
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Update Modal */}
      <AnimatePresence>
        {isStatusModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Update Status</h2>
              <p className="text-sm text-gray-500 mb-6">Updating status to: <span className="font-bold text-gray-900 uppercase">{statusUpdate.status.replace(/_/g, ' ')}</span></p>
              
              <form onSubmit={handleStatusSubmit} className="space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-bold text-gray-700">SM Notes / Comments</label>
                  <button
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onMouseLeave={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${
                      isRecording ? 'bg-red-100 text-red-600 animate-pulse border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-gray-200'
                    } border`}
                  >
                    {isRecording ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-3 h-3" />}
                    {isRecording ? 'Recording...' : isTranscribing ? 'Transcribing...' : 'Hold to Record Voice Note'}
                  </button>
                </div>
                <textarea
                  required
                  rows={4}
                  value={statusUpdate.notes}
                  onChange={(e) => setStatusUpdate({ ...statusUpdate, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder={isTranscribing ? 'Transcribing your voice...' : 'Provide details about this status change...'}
                />

                <div className="pt-2 border-t border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input 
                      type="checkbox" 
                      checked={statusUpdate.createTask}
                      onChange={(e) => setStatusUpdate({ ...statusUpdate, createTask: e.target.checked })}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-sm font-bold text-gray-700">Create Follow-up Task</span>
                  </label>
                  
                  {statusUpdate.createTask && (
                    <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Task Title</label>
                        <input
                          type="text"
                          required={statusUpdate.createTask}
                          value={statusUpdate.taskTitle}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, taskTitle: e.target.value })}
                          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                          placeholder="e.g. Call back for negotiation"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Due Date</label>
                          <input
                            type="date"
                            required={statusUpdate.createTask}
                            value={statusUpdate.taskDueDate}
                            onChange={(e) => setStatusUpdate({ ...statusUpdate, taskDueDate: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assign To</label>
                          <select
                            required={statusUpdate.createTask}
                            value={statusUpdate.taskAssignedTo}
                            onChange={(e) => setStatusUpdate({ ...statusUpdate, taskAssignedTo: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                          >
                            <option value="">Select Assignee</option>
                            <optgroup label="Sales Managers">
                              {sms.map(sm => (
                                <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Partners & Vendors">
                              {partners.map(p => (
                                <option key={p.uid} value={p.uid}>{p.companyName || p.displayName}</option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-4 mt-8">
                  <button
                    type="button"
                    onClick={() => setIsStatusModalOpen(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                  >
                    Update Status
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lead Details Slide-over Panel */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-end z-[60]">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50 shrink-0">
                <div className="flex justify-between items-start w-full md:w-auto">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-1">Lead Details</h2>
                    <p className="text-xs md:text-sm text-gray-500 break-words pr-2">For: {selectedLead.customerName} ({selectedLead.enquiryId})</p>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedLead(null);
                      setFeedbackRecordingFile(null);
                    }}
                    className="md:hidden p-2 hover:bg-gray-200 rounded-full transition-colors bg-white border border-gray-200 shadow-sm shrink-0"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
                  <div className="flex flex-wrap items-center gap-1 bg-white p-1 md:p-1.5 rounded-xl border border-gray-200 shadow-sm mr-0 md:mr-2">
                    <a href={`tel:${selectedLead.customerPhone}`} className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all" title="Call">
                      <Phone className="w-4 h-4 md:w-5 md:h-5" />
                    </a>
                    <a href={`sms:${selectedLead.customerPhone}`} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="SMS">
                      <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
                    </a>
                    <a href={`https://wa.me/${selectedLead.customerPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-500 hover:text-green-500 hover:bg-green-50 rounded-lg transition-all" title="WhatsApp">
                      <Send className="w-4 h-4 md:w-5 md:h-5" />
                    </a>
                    <a href={`mailto:${selectedLead.customerEmail}`} className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all" title="Email">
                      <Mail className="w-4 h-4 md:w-5 md:h-5" />
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      setEditLeadData(selectedLead);
                      setIsEditModalOpen(true);
                    }}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all bg-white border border-gray-200 shadow-sm"
                    title="Edit Lead"
                  >
                    <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                  {(() => {
                    const { total } = calculateLeadScore(selectedLead);
                    return (
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Score</span>
                        <span className={`text-xs md:text-sm font-black ${
                          total > 70 ? 'text-green-600' : total > 40 ? 'text-blue-600' : 'text-orange-600'
                        }`}>{total}/100</span>
                      </div>
                    );
                  })()}
                  <button 
                    onClick={() => {
                      setSelectedLead(null);
                      setFeedbackRecordingFile(null);
                    }}
                    className="hidden md:block p-2 hover:bg-gray-200 rounded-full transition-colors bg-white border border-gray-200 shadow-sm"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* View Toggle Tabs */}
                <div className="flex bg-gray-100 p-1 rounded-xl mb-8 overflow-x-auto whitespace-nowrap scrollbar-hide">
                  <button
                    onClick={() => setFeedbackView('history')}
                    className={`flex-1 py-2.5 px-4 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                      feedbackView === 'history' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Lead History
                  </button>
                  <button
                    onClick={() => setFeedbackView('vendor')}
                    className={`flex-1 py-2.5 px-4 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                      feedbackView === 'vendor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Vendor View
                  </button>
                  <button
                    onClick={() => setFeedbackView('sm')}
                    className={`flex-1 py-2.5 px-4 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                      feedbackView === 'sm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    SM Notes
                  </button>
                  <button
                    onClick={() => setFeedbackView('call_analysis')}
                    className={`flex-1 py-2.5 px-4 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                      feedbackView === 'call_analysis' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Call Analysis
                  </button>
                  <button
                    onClick={() => setFeedbackView('tasks')}
                    className={`flex-1 py-2.5 px-4 text-[10px] md:text-xs font-bold rounded-lg transition-all ${
                      feedbackView === 'tasks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Tasks ({tasks.length})
                  </button>
                </div>

                <div className="space-y-8">
                  {/* AI Follow-up Suggestions Section */}
                  <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                        <Bot className="w-3 h-3" />
                        AI Follow-up Intelligence
                      </h4>
                      <button
                        onClick={() => handleGetFollowUpSuggestions(selectedLead)}
                        disabled={isSuggestingFollowUps}
                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-indigo-100 shadow-sm transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSuggestingFollowUps ? 'animate-spin' : ''}`} />
                        {followUpSuggestions.length > 0 ? 'Refresh' : 'Get Suggestions'}
                      </button>
                    </div>

                    {isSuggestingFollowUps ? (
                      <div className="flex flex-col items-center justify-center py-8 space-y-3">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                        </div>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Analyzing lead context...</p>
                      </div>
                    ) : followUpSuggestions.length > 0 ? (
                      <div className="space-y-3">
                        {followUpSuggestions.map((suggestion, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm hover:shadow-md transition-all group">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`p-1 rounded ${
                                    suggestion.type === 'call' ? 'bg-blue-50 text-blue-600' :
                                    suggestion.type === 'email' ? 'bg-purple-50 text-purple-600' :
                                    suggestion.type === 'whatsapp' ? 'bg-green-50 text-green-600' :
                                    'bg-orange-50 text-orange-600'
                                  }`}>
                                    {suggestion.type === 'call' && <Clock className="w-3 h-3" />}
                                    {suggestion.type === 'email' && <Send className="w-3 h-3" />}
                                    {suggestion.type === 'whatsapp' && <MessageSquare className="w-3 h-3" />}
                                    {suggestion.type === 'meeting' && <Calendar className="w-3 h-3" />}
                                  </span>
                                  <h5 className="text-sm font-bold text-gray-900">{suggestion.title}</h5>
                                </div>
                                <p className="text-xs text-gray-600 leading-relaxed mb-3">{suggestion.description}</p>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                    In {suggestion.suggestedDaysFromNow} days
                                  </span>
                                  <button
                                    onClick={() => handleScheduleSuggestion(suggestion, selectedLead)}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Schedule
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Sparkles className="w-8 h-8 text-indigo-200 mx-auto mb-2" />
                        <p className="text-xs text-indigo-300 font-medium">Click "Get Suggestions" for AI-powered follow-up strategy.</p>
                      </div>
                    )}
                  </div>

                  {/* Lead Tags Section */}
                  {selectedLead.tags && selectedLead.tags.length > 0 && (
                    <div className="bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50">
                      <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Sparkles className="w-3 h-3" />
                        Lead Tags
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedLead.tags.map((tag: string, i: number) => (
                          <span key={i} className="px-3 py-1 bg-white text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100 shadow-sm">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Client Profile Section */}
                  <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <User className="w-3 h-3" />
                      Client Profile
                    </h4>
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Email</span>
                        <p className="text-sm font-bold text-gray-900 break-all">{selectedLead.customerEmail || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Location</span>
                        <p className="text-sm font-bold text-gray-900">{selectedLead.livingLocation || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Gender</span>
                        <p className="text-sm font-bold text-gray-900 capitalize">{selectedLead.gender || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Client Type</span>
                        <p className="text-sm font-bold text-gray-900 capitalize">{(selectedLead.clientType || 'end_user').replace('_', ' ')}</p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-gray-100">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Professional Info</span>
                        <div className="mt-2 space-y-2">
                          <p className="text-sm text-gray-900">
                            <span className="font-bold">{selectedLead.designation || 'N/A'}</span> at <span className="font-bold">{selectedLead.companyName || 'N/A'}</span>
                          </p>
                          <p className="text-sm text-gray-600">
                            Profession: <span className="font-bold text-gray-900">{selectedLead.profession || 'N/A'}</span>
                          </p>
                          {selectedLead.linkedinProfile && (
                            <a 
                              href={selectedLead.linkedinProfile} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 mt-1"
                            >
                              <Link className="w-3 h-3" />
                              LinkedIn Profile
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recordings Section (Always visible) */}
                  {(selectedLead.callRecordingUrl || selectedLead.additionalRecordings?.length > 0) && (
                    <div className="space-y-4">
                      {selectedLead.callRecordingUrl && (
                        <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100">
                          <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            Initial Call Recording
                          </h4>
                          <audio controls src={selectedLead.callRecordingUrl} className="w-full h-10 mb-4 focus:outline-none" />
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setFeedbackView('call_analysis')}
                              className="text-xs font-bold text-blue-600 bg-white px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 transition-all flex items-center gap-2 shadow-sm"
                            >
                              <Bot className="w-4 h-4" />
                              {selectedLead.callAnalysis ? 'View AI Intelligence Summary' : 'Analyze Recording'}
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedLead.additionalRecordings?.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gray-300"></div>
                            Additional Call Recordings
                          </h4>
                          <div className="grid gap-3">
                            {selectedLead.additionalRecordings.map((rec: any, i: number) => (
                              <div key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-xs font-bold text-gray-700 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">Attempt {i + 2}</span>
                                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{new Date(rec.addedAt).toLocaleString()}</span>
                                </div>
                                <audio controls src={rec.url} className="w-full h-10 mb-2" />
                                {rec.analysis && (
                                  <div className="mt-3 pt-3 border-t border-gray-200 text-xs space-y-2">
                                    <p><span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider block mb-0.5">Summary</span> <span className="text-gray-700">{rec.analysis.summary}</span></p>
                                    {rec.analysis.tags && (
                                      <div className="flex flex-wrap gap-1">
                                        {rec.analysis.tags.map((tag: string, j: number) => (
                                          <span key={j} className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] font-bold rounded uppercase">{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <p className="text-[10px] text-gray-500 font-medium flex items-center gap-1 justify-end mt-2">
                                  <User className="w-3 h-3" />
                                  Added by: {rec.addedBy}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab Content */}
                  <div className="flex-1 overflow-y-auto">
                    {feedbackView === 'history' ? (
                      <div className="space-y-6">
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest mb-4">Lead Timeline</h4>
                        <div className="relative border-l-2 border-indigo-100 ml-4 space-y-6 pb-4">
                          
                          {/* Chronological History Rendering */}
                          {[...((selectedLead.statusHistory || []) as any[])]
                            .sort((a, b) => {
                              const dateA = a.updatedAt?.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
                              const dateB = b.updatedAt?.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt);
                              return dateB.getTime() - dateA.getTime();
                            })
                            .map((h: any, i: number) => (
                              <div key={i} className="relative pl-6">
                                <div className="absolute w-3 h-3 bg-indigo-500 rounded-full -left-[7px] top-1.5 ring-4 ring-white" />
                                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                                  <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-black uppercase text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md tracking-wider">
                                      {h.status?.replace(/_/g, ' ') || 'STATUS UPDATE'}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">
                                      {new Date(h.updatedAt?.toDate ? h.updatedAt.toDate() : h.updatedAt).toLocaleString()}
                                    </span>
                                  </div>
                                  {h.notes && (
                                    <p className="text-sm text-gray-700 mt-2 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 rounded-tl-sm">
                                      {h.notes}
                                    </p>
                                  )}
                                  <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400 font-bold">
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3 h-3" />
                                      {h.updatedBy || 'System'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                          ))}

                          {/* Initial Creation Event */}
                          <div className="relative pl-6">
                            <div className="absolute w-3 h-3 bg-gray-300 rounded-full -left-[7px] top-1.5 ring-4 ring-white" />
                            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h5 className="text-[11px] font-black uppercase text-gray-600 mb-1">Lead Captured</h5>
                                  <p className="text-xs text-gray-500">
                                    Imported into system.
                                  </p>
                                </div>
                                <span className="text-[10px] font-bold text-gray-400">
                                  {new Date(selectedLead.createdAt?.toDate ? selectedLead.createdAt.toDate() : selectedLead.createdAt).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                        </div>
                      </div>
                    ) : feedbackView === 'call_analysis' ? (
                      <div className="space-y-6">
                        {selectedLead.callAnalysis ? (
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                            {/* Audit Header */}
                            <div className="flex items-center justify-between border-b border-gray-50 pb-5">
                              <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-2xl ${
                                  selectedLead.callAnalysis.auditOutcome === 'QUALIFIED' ? 'bg-green-50' : 
                                  selectedLead.callAnalysis.auditOutcome === 'UNQUALIFIED' ? 'bg-red-50' : 'bg-orange-50'
                                }`}>
                                  <CheckCircle className={`w-8 h-8 ${
                                    selectedLead.callAnalysis.auditOutcome === 'QUALIFIED' ? 'text-green-500' : 
                                    selectedLead.callAnalysis.auditOutcome === 'UNQUALIFIED' ? 'text-red-500' : 'text-orange-500'
                                  }`} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Audit Outcome</p>
                                  <h4 className={`text-2xl font-black tracking-tight ${
                                    selectedLead.callAnalysis.auditOutcome === 'QUALIFIED' ? 'text-green-600' : 
                                    selectedLead.callAnalysis.auditOutcome === 'UNQUALIFIED' ? 'text-red-600' : 'text-orange-600'
                                  }`}>
                                    {selectedLead.callAnalysis.auditOutcome || 'QUALIFIED'}
                                  </h4>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Auditor Confidence</p>
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl font-black text-gray-900">{selectedLead.callAnalysis.confidenceScore || Math.round((selectedLead.callAnalysis.confidence || 0) * 100)}%</span>
                                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-indigo-600 rounded-full" 
                                      style={{ width: `${selectedLead.callAnalysis.confidenceScore || (selectedLead.callAnalysis.confidence ? selectedLead.callAnalysis.confidence * 100 : 0)}%` }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Qualification Matrix */}
                            <div>
                               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Qualification Matrix</label>
                               <div className="grid grid-cols-2 gap-3">
                                 {selectedLead.callAnalysis.qualificationMatrix ? Object.entries(selectedLead.callAnalysis.qualificationMatrix).map(([key, data]: [string, any]) => (
                                   <div key={key} className="bg-gray-50/50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                                     <div>
                                       <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">{key}</p>
                                       <p className="text-xs font-black text-gray-900">{data.value}</p>
                                     </div>
                                     <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter flex items-center gap-1 ${
                                       data.isMatched ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                     }`}>
                                       {data.isMatched ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                       {data.isMatched ? 'Matched' : 'Mismatch'}
                                     </div>
                                   </div>
                                 )) : (
                                   <div className="col-span-2 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-[9px] text-gray-400 font-bold uppercase">
                                     Standard Matrix Data Not Available
                                   </div>
                                 )}
                               </div>
                             </div>

                             {/* Sentiment & Summary */}
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                               <div className="md:col-span-2">
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                   <MessageSquare className="w-3 h-3 text-indigo-400" />
                                   Conversation Summary
                                 </label>
                                 <div className="bg-indigo-50/20 p-5 rounded-2xl border border-indigo-100/50 relative">
                                   <CornerUpLeft className="w-8 h-8 text-indigo-100 absolute -top-4 -left-4 -scale-100 opacity-50" />
                                   <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                     {selectedLead.callAnalysis.summary}
                                   </p>
                                 </div>
                               </div>
                               <div>
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sentiment Analysis</label>
                                 <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-center">
                                   <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 ${
                                     (selectedLead.callAnalysis.sentiment?.label === 'POSITIVE' || selectedLead.callAnalysis.sentiment === 'Positive') ? 'bg-green-50 text-green-600' : 
                                     (selectedLead.callAnalysis.sentiment?.label === 'NEGATIVE' || selectedLead.callAnalysis.sentiment === 'Negative') ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-600'
                                   }`}>
                                     {(selectedLead.callAnalysis.sentiment?.label === 'POSITIVE' || selectedLead.callAnalysis.sentiment === 'Positive') ? <CheckCircle className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                                     <span className="text-xs font-black uppercase tracking-wider">{selectedLead.callAnalysis.sentiment?.label || selectedLead.callAnalysis.sentiment || 'NEUTRAL'}</span>
                                   </div>
                                   <p className="text-4xl font-black text-gray-900">{selectedLead.callAnalysis.sentiment?.score || 0}%</p>
                                 </div>
                               </div>
                             </div>

                             {/* Blockers & Advice */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                               <div className="space-y-4">
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                   <XCircle className="w-3 h-3 text-red-400" />
                                   Conversion Blockers
                                 </label>
                                 {(selectedLead.callAnalysis.conversionBlockers || selectedLead.callAnalysis.painPoints || []).map((blocker: string, i: number) => (
                                   <div key={i} className="flex items-start gap-4 p-4 bg-red-50/50 rounded-xl border border-red-100 group">
                                     <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0 group-hover:rotate-90 transition-transform" />
                                     <p className="text-xs text-red-800 font-bold leading-relaxed">{blocker}</p>
                                   </div>
                                 ))}
                                 {(selectedLead.callAnalysis.conversionBlockers || selectedLead.callAnalysis.painPoints || []).length === 0 && (
                                   <div className="text-center py-4 text-[9px] text-gray-400 font-bold uppercase italic tracking-widest bg-gray-50 rounded-xl border border-dashed">No Blockers Identified</div>
                                 )}
                               </div>
                               <div className="space-y-4">
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                   <Sparkles className="w-3 h-3 text-green-400" />
                                   AI Strategic Advice
                                 </label>
                                 {(selectedLead.callAnalysis.strategicAdvice || selectedLead.callAnalysis.objections || []).map((advice: string, i: number) => (
                                   <div key={i} className="flex items-start gap-4 p-4 bg-green-50/50 rounded-xl border border-green-100 group">
                                     <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                                     <p className="text-xs text-green-800 font-bold leading-relaxed">{advice}</p>
                                   </div>
                                 ))}
                                 {(selectedLead.callAnalysis.strategicAdvice || selectedLead.callAnalysis.objections || []).length === 0 && (
                                   <div className="text-center py-4 text-[9px] text-gray-400 font-bold uppercase italic tracking-widest bg-gray-50 rounded-xl border border-dashed">No Specific Advice Provided</div>
                                 )}
                               </div>
                             </div>

                             {/* Suggested Tasks */}
                             {selectedLead.callAnalysis.suggestedTasks && selectedLead.callAnalysis.suggestedTasks.length > 0 && (
                               <div className="space-y-4 pt-4 border-t border-gray-100">
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                   <CheckSquare className="w-3 h-3 text-blue-400" />
                                   Suggested Next Steps
                                 </label>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   {selectedLead.callAnalysis.suggestedTasks.map((task: any, i: number) => (
                                     <div key={i} className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-between">
                                       <div>
                                         <div className="flex justify-between items-start mb-2 gap-2">
                                           <h4 className="font-bold text-sm text-gray-900 leading-tight">{task.title}</h4>
                                           <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">In {task.dueInDays} days</span>
                                         </div>
                                         <p className="text-xs text-gray-600 mb-4">{task.description}</p>
                                       </div>
                                       <button
                                         onClick={(e) => {
                                           e.preventDefault();
                                           setNewTask({
                                             title: task.title,
                                             dueDate: new Date(Date.now() + task.dueInDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                                             assignedTo: isSM ? (profile?.uid || '') : ''
                                           });
                                           setFeedbackView('tasks');
                                         }}
                                         className="w-full text-[10px] font-bold text-blue-600 bg-blue-50 py-2 rounded-lg hover:bg-blue-100 transition-colors uppercase tracking-widest flex justify-center items-center gap-2"
                                       >
                                         <Calendar className="w-3 h-3" />
                                         Schedule Task
                                       </button>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}

                             {/* Transcript */}
                             {selectedLead.callAnalysis.transcription && (
                               <div>
                                 <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                   <FileText className="w-3 h-3 text-indigo-400" />
                                   Call Transcription (Verbatim)
                                 </label>
                                 <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 h-64 overflow-y-auto font-mono text-[11px] text-indigo-100/70 leading-relaxed scrollbar-hide select-all">
                                   {selectedLead.callAnalysis.transcription.split('\n').map((line: string, j: number) => (
                                     <div key={j} className={`mb-3 flex gap-4 ${line.startsWith('Sales') ? 'text-blue-300' : line.startsWith('Customer') ? 'text-indigo-100 font-medium' : 'text-gray-500 italic'}`}>
                                       <span className="opacity-30 shrink-0">{(j + 1).toString().padStart(2, '0')}</span>
                                       <p>{line}</p>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}

                             {/* Additional Info Tags */}
                             {selectedLead.callAnalysis.tags && (
                               <div className="pt-4 border-t border-gray-50">
                                 <div className="flex flex-wrap gap-2">
                                   {selectedLead.callAnalysis.tags.map((tag: string, i: number) => (
                                     <span key={i} className="px-3 py-1 bg-gray-50 text-gray-600 text-[10px] font-bold rounded-lg border border-gray-100 uppercase tracking-wider">
                                       {tag}
                                     </span>
                                   ))}
                                 </div>
                               </div>
                             )}
                          </div>
                        ) : (
                          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
                              <Bot className="w-10 h-10 text-gray-300" />
                            </div>
                            <h5 className="text-lg font-black text-gray-900 mb-2">Generate Intelligence</h5>
                            <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
                              {selectedLead.callRecordingUrl 
                                ? 'This lead has a recording available but it hasn\'t been strategically analyzed yet.' 
                                : 'Upload a call recording or provide a URL to unlock deep conversion insights.'}
                            </p>
                            {selectedLead.callRecordingUrl && (
                              <button
                                onClick={handleAnalyzeSelectedLeadRecording}
                                disabled={isAnalyzing}
                                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-3 mx-auto disabled:opacity-50"
                              >
                                {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                                {isAnalyzing ? 'Analyzing Strategy...' : 'Analyze Strategic Intelligence'}
                              </button>
                            )}
                          </div>
                        )}
                        
                        {/* Additional Recordings Analysis History */}
                        {selectedLead.additionalRecordings?.some((r: any) => r.analysis) && (
                          <div className="space-y-4 pt-6 mt-6 border-t border-gray-100">
                            <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">History of Feedback Analysis</h5>
                            {selectedLead.additionalRecordings.map((rec: any, i: number) => rec.analysis && (
                              <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm opacity-80 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-center mb-3">
                                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">Attempt {i + 2}</span>
                                  <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{new Date(rec.addedAt).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-gray-700 leading-relaxed font-medium italic mb-2">"{rec.analysis.summary}"</p>
                                {rec.analysis.tags && (
                                  <div className="flex flex-wrap gap-1">
                                    {rec.analysis.tags.map((tag: string, j: number) => (
                                      <span key={j} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-bold rounded uppercase">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : feedbackView === 'tasks' ? (
                      <div className="space-y-6">
                        <form onSubmit={handleAddTask} className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-4">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Create New Task</p>
                          <input
                            required
                            type="text"
                            placeholder="Task title (e.g. Call back)"
                            value={newTask.title}
                            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="date"
                              required
                              min={new Date().toISOString().split('T')[0]}
                              value={newTask.dueDate}
                              onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                              className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                            />
                            <select
                              required
                              value={newTask.assignedTo}
                              onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                              className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                            >
                              <option value="">Assign to...</option>
                              <optgroup label="Sales Managers">
                                {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                              </optgroup>
                              <optgroup label="Admins">
                                {admins.map(admin => <option key={admin.uid} value={admin.uid}>{admin.displayName} (Admin)</option>)}
                              </optgroup>
                            </select>
                          </div>
                          <button
                            type="submit"
                            className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20"
                          >
                            Add Task
                          </button>
                        </form>

                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">Active Tasks</p>
                          {tasks.length > 0 ? (
                            tasks.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)).map((task) => (
                              <div key={task.id} className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                                task.completed ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
                              }`}>
                                <button
                                  onClick={() => toggleTaskCompletion(task.id, task.completed)}
                                  className={`w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0 ${
                                    task.completed ? 'bg-green-500 text-white' : 'border-2 border-gray-300 hover:border-gray-900'
                                  }`}
                                >
                                  {task.completed && <Check className="w-4 h-4" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-bold truncate ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                    {task.title}
                                  </p>
                                  <div className="flex items-center gap-4 mt-1.5">
                                    <span className="text-[11px] text-gray-500 flex items-center gap-1.5 bg-gray-100 px-2 py-0.5 rounded-md">
                                      <User className="w-3 h-3" />
                                      {sms.find(s => s.uid === task.assignedTo)?.displayName || 'Assigned'}
                                    </span>
                                    {task.dueDate && (
                                      <span className={`text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded-md ${
                                        !task.completed && new Date(task.dueDate) < new Date() ? 'bg-red-50 text-red-600 font-bold' : 'bg-gray-100 text-gray-500'
                                      }`}>
                                        <Calendar className="w-3 h-3" />
                                        {new Date(task.dueDate).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                              <CheckSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                              <p className="text-sm text-gray-400 font-medium">No tasks found for this lead.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : feedbackView === 'vendor' ? (
                      <div className="space-y-6">
                        <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Initial Vendor Notes</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedLead.vendorNotes || 'No initial notes.'}</p>
                        </div>

                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">Partner/Vendor History</p>
                          {selectedLead.partnerFeedback?.length > 0 ? (
                            <div className="space-y-2">
                              {selectedLead.partnerFeedback.map((f: string, i: number) => (
                                <div key={i} className="p-4 bg-gray-50 rounded-xl text-sm text-gray-700 border border-gray-200 leading-relaxed">{f}</div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 px-1 italic">No partner history yet.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">Status History & SM Notes</p>
                          {selectedLead.statusHistory?.length > 0 ? (
                            <div className="space-y-3">
                              {selectedLead.statusHistory.map((h: any, i: number) => (
                                <div key={i} className="p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md tracking-wider">{h.status.replace(/_/g, ' ')}</span>
                                    <span className="text-[11px] font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-full">{new Date(h.updatedAt?.toDate ? h.updatedAt.toDate() : h.updatedAt).toLocaleString()}</span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed mt-2">{h.notes}</p>
                                  <p className="text-[10px] font-medium text-gray-400 mt-3 flex items-center gap-1 justify-end">
                                    <User className="w-3 h-3" />
                                    By: {h.updatedBy}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 px-1 italic">No status history yet.</p>
                          )}
                        </div>

                        <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200">
                          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">SM General Feedback</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{selectedLead.smFeedback || 'No general feedback yet.'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer / Form */}
              <div className="p-6 border-t border-gray-100 bg-gray-50/50 shrink-0">
                <form onSubmit={handleAddFeedback} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      {isSM || isAdmin ? 'Update SM Feedback' : 'Add Partner Feedback'}
                    </label>
                    <textarea
                      rows={3}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none resize-none transition-all text-sm"
                      placeholder="Enter your update here..."
                    />
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                      <div>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => setFeedbackRecordingFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="feedback-recording-upload"
                        />
                        <label
                          htmlFor="feedback-recording-upload"
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 transition-all text-sm font-bold shadow-sm whitespace-nowrap"
                        >
                          <Upload className="w-4 h-4" />
                          {feedbackRecordingFile ? 'Change Audio' : 'Attach Recording'}
                        </label>
                        {feedbackRecordingFile && (
                          <p className="text-[10px] text-gray-500 mt-1.5 truncate max-w-[200px] font-medium">
                            {feedbackRecordingFile.name}
                          </p>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Link className="h-4 w-4 text-gray-400" />
                          </div>
                          <input
                            type="url"
                            placeholder="Or paste Cloud URL here..."
                            value={feedbackCloudUrl}
                            onChange={(e) => setFeedbackCloudUrl(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none text-sm transition-all shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isUploadingFeedbackRecording || (!feedback && !feedbackRecordingFile && !feedbackCloudUrl)}
                      className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-gray-900/20 w-full sm:w-auto shrink-0"
                    >
                      {isUploadingFeedbackRecording && <RefreshCw className="w-4 h-4 animate-spin" />}
                      {isUploadingFeedbackRecording ? 'Saving...' : 'Save Update'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {isBulkDeleteModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-6">
                  <Trash2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Bulk Delete?</h2>
                <p className="text-sm text-gray-500 mb-8">
                  Are you sure you want to delete <span className="font-bold text-red-600">{selectedLeadIds.length}</span> selected leads? This action is permanent and cannot be undone.
                </p>
                <div className="flex gap-4 w-full">
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteModalOpen(false)}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Delete Leads
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hierarchy Management Modal */}
      <AnimatePresence>
        {isHierarchyModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl max-w-4xl w-full p-6 md:p-8 shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 leading-none">Hierarchy Management</h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2">Manage Agencies, Platforms & Vendors</p>
                </div>
                <button onClick={() => setIsHierarchyModalOpen(false)} className="bg-gray-50 p-3 rounded-2xl text-gray-400 hover:text-gray-900 transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 overflow-hidden">
                {/* Agency Management */}
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 flex flex-col h-full overflow-hidden">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-indigo-500 text-white rounded-xl">
                      <User className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-xs uppercase tracking-widest text-gray-600">Agencies</h3>
                  </div>
                  <form 
                    onSubmit={(e: any) => {
                      e.preventDefault();
                      if (e.target.agencyName.value) {
                        handleHierarchyAction('agency', 'add', { name: e.target.agencyName.value });
                        e.target.agencyName.value = '';
                      }
                    }}
                    className="flex gap-2 mb-4"
                  >
                    <input name="agencyName" required placeholder="New Agency..." className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button type="submit" className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"><Check className="w-4 h-4" /></button>
                  </form>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {agencies.filter(a => isAdmin || a.partnerId === (profile?.vendorCompanyId || profile?.uid)).map(a => (
                      <div key={a.id} className={`p-3 rounded-xl border flex items-center justify-between transition-all ${currentAgency?.id === a.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                        <button onClick={() => { setCurrentAgency(a); setCurrentSource(null); }} className="flex-1 text-left text-sm font-bold truncate pr-3">{a.name}</button>
                        <button onClick={() => handleHierarchyAction('agency', 'delete', { id: a.id })} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source Management */}
                <div className={`bg-gray-50 rounded-2xl border border-gray-200 p-5 flex flex-col h-full overflow-hidden transition-opacity ${!currentAgency ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-blue-500 text-white rounded-xl">
                      <Filter className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-xs uppercase tracking-widest text-gray-600">Platforms/Vendors</h3>
                  </div>
                  {currentAgency && <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-tighter mb-4">Under: {currentAgency.name}</p>}
                  <form 
                    onSubmit={(e: any) => {
                      e.preventDefault();
                      if (e.target.sourceName.value && currentAgency) {
                        handleHierarchyAction('source', 'add', { name: e.target.sourceName.value, agencyId: currentAgency.id });
                        e.target.sourceName.value = '';
                      }
                    }}
                    className="flex gap-2 mb-4"
                  >
                    <input name="sourceName" required placeholder="New Platform..." className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700"><Check className="w-4 h-4" /></button>
                  </form>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {sources.filter(s => s.agencyId === currentAgency?.id).map(s => (
                      <div key={s.id} className={`p-3 rounded-xl border flex items-center justify-between transition-all ${currentSource?.id === s.id ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                        <button onClick={() => setCurrentSource(s)} className="flex-1 text-left text-sm font-bold truncate pr-3">{s.name}</button>
                        <button onClick={() => handleHierarchyAction('source', 'delete', { id: s.id })} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subsource Management */}
                <div className={`bg-gray-50 rounded-2xl border border-gray-200 p-5 flex flex-col h-full overflow-hidden transition-opacity ${!currentSource ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-green-500 text-white rounded-xl">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <h3 className="font-black text-xs uppercase tracking-widest text-gray-600">Subsources</h3>
                  </div>
                  {currentSource && <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tighter mb-4">Under: {currentSource.name}</p>}
                  <form 
                    onSubmit={(e: any) => {
                      e.preventDefault();
                      if (e.target.subName.value && currentSource) {
                        handleHierarchyAction('subsource', 'add', { name: e.target.subName.value, sourceId: currentSource.id, agencyId: currentAgency?.id });
                        e.target.subName.value = '';
                      }
                    }}
                    className="flex gap-2 mb-4"
                  >
                    <input name="subName" required placeholder="New Subsource..." className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500" />
                    <button type="submit" className="p-2 bg-green-600 text-white rounded-xl hover:bg-green-700"><Check className="w-4 h-4" /></button>
                  </form>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {subsources.filter(ss => ss.sourceId === currentSource?.id).map(ss => (
                      <div key={ss.id} className={`p-3 rounded-xl border border-gray-100 bg-white flex items-center justify-between transition-all hover:border-gray-200`}>
                        <span className="flex-1 text-sm font-bold truncate pr-3">{ss.name}</span>
                        <button onClick={() => handleHierarchyAction('subsource', 'delete', { id: ss.id })} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* AI Chatbot */}
      <Chatbot leads={leads} profile={profile} selectedLead={selectedLead} />
    </motion.div>
  );
}

function Chatbot({ leads, profile, selectedLead }: { leads: any[], profile: any, selectedLead?: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([
    { role: 'assistant', content: `Hello ${profile?.displayName}! I'm your AI Sales Assistant. How can I help you manage your leads today?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatWithGemini([...messages, userMessage], { user: profile, leads, selectedLead });
      setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-[350px] sm:w-[400px] h-[500px] flex flex-col overflow-hidden mb-4"
          >
            {/* Header */}
            <div className="bg-gray-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Bot className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">AI Sales Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-gray-900 text-white rounded-tr-none shadow-lg shadow-gray-900/10' 
                      : 'bg-white text-gray-700 border border-gray-100 rounded-tl-none shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input
                type="text"
                placeholder="Ask me anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-gray-900 transition-all"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 transition-all shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-gray-900 text-white rounded-2xl flex items-center justify-center shadow-2xl hover:bg-gray-800 transition-all hover:scale-105 active:scale-95 group relative"
      >
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
        {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />}
      </button>
    </div>
  );
}
