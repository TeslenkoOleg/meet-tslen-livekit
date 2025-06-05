import {Component, HostListener, input, OnDestroy, OnInit, signal, effect} from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import {
    LocalVideoTrack,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    Room,
    RoomEvent,
    VideoPresets,
    VideoTrack
} from 'livekit-client';

import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import {VideoComponent} from "../video/video.component";
import {AudioComponent} from "../audio/audio.component";
import {NgClass} from "@angular/common";
import {RouterLink} from "@angular/router";

type TrackInfo = {
    trackPublication: RemoteTrackPublication;
    participantIdentity: string;
};

// When running OpenVidu locally, leave these variables empty
// For other deployment type, configure them with correct URLs depending on your deployment
let APPLICATION_SERVER_URL = '';
let LIVEKIT_URL = 'wss://tslen-sihva4bl.livekit.cloud';
@Component({
    selector: 'app-wellcome',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        VideoComponent,
        AudioComponent,
        NgClass,
        RouterLink,
    ],
    templateUrl: './wellcome.component.html',
    styleUrl: './wellcome.component.css'
})
export class WellcomeComponent implements OnDestroy, OnInit {
    roomForm = new FormGroup({
        roomName: new FormControl( '' + Date.now(), Validators.required),
        participantName: new FormControl('Participant' + Math.floor(Math.random() * 100), Validators.required),
    });
    currentRoomLink = signal<string>('');

    room = signal<Room | undefined>(undefined);
    localTrack = signal<LocalVideoTrack | undefined>(undefined);
    remoteTracksMap = signal<Map<string, TrackInfo>>(new Map());
    // input from route
    id = input<string | null>();
    cameraIsEnable = signal<boolean>(true);
    screenShareEnabled = signal<boolean>(false);
    microphoneEnabled = signal<boolean>(true);
    localCameraTrack = signal<LocalVideoTrack | undefined>(undefined);
localScreenTrack = signal<LocalVideoTrack | undefined>(undefined);
videoSize = signal<'small' | 'medium' | 'large' | 'fullscreen'>('medium');
    isFullscreen = signal<boolean>(false);

    mainVideoTrack = signal<VideoTrack | null>(null);
      mainVideoParticipant = signal<string>('');
      isLocalMainVideo = signal<boolean>(true);

    constructor(private httpClient: HttpClient) {
        this.configureUrls();
    }
    ngOnInit() {
        // If the id is provided in the route, set it as the room name
        if (this.id()) {
            this.roomForm.patchValue({ roomName: this.id() });
                    // this.joinRoom()
        }
    }

    configureUrls() {
        // If APPLICATION_SERVER_URL is not configured, use default value from OpenVidu Local deployment
        if (!APPLICATION_SERVER_URL) {
            if (window.location.hostname === 'localhost') {
                APPLICATION_SERVER_URL = 'http://localhost:6080/';
            } else {
                APPLICATION_SERVER_URL = 'https://' + window.location.hostname + ':6443/';
            }
        }

        // If LIVEKIT_URL is not configured, use default value from OpenVidu Local deployment
        if (!LIVEKIT_URL) {
            if (window.location.hostname === 'localhost') {
                LIVEKIT_URL = 'ws://localhost:7880/';
            } else {
                LIVEKIT_URL = 'wss://' + window.location.hostname + ':7443/';
            }
        }
    }

    async joinRoom() {
        // Initialize a new Room object
        const room = new Room(
            {
                adaptiveStream: true, // Enable adaptive stream to optimize video quality
                dynacast: true, // Enable dynacast to reduce bandwidth usage
                // autoSubscribe: true, // Automatically subscribe to all tracks in the room
                // default capture settings
                  videoCaptureDefaults: {
                    resolution: VideoPresets.h720.resolution,
                  },
            }
        );
        this.room.set(room);

        // Specify the actions when events take place in the room
        // On every new Track received...
        room.on(
            RoomEvent.TrackSubscribed,
            (_track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
                this.remoteTracksMap.update((map) => {
                    map.set(publication.trackSid, {
                        trackPublication: publication,
                        participantIdentity: participant.identity,
                    });
                    return map;
                });
            }
        );

        // On every new Track destroyed...
        room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, publication: RemoteTrackPublication) => {
            this.remoteTracksMap.update((map) => {
                map.delete(publication.trackSid);
                return map;
            });
        });
        // Add this to your joinRoom() method after creating the room and setting up other event listeners

room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
    console.log('LocalTrackPublished:', publication.kind, publication.source);

    if (publication.kind === 'video') {
        if (publication.source === 'camera') {
            this.localCameraTrack.set(publication.videoTrack);
            console.log('Camera track set:', publication.videoTrack);
            if (!this.screenShareEnabled()) {
                this.localTrack.set(publication.videoTrack);
            }
        } else if (publication.source === 'screen_share') {
            console.log('Screen share track published:', publication.videoTrack);
            console.log('Screen track mediaStreamTrack:', publication.videoTrack?.mediaStreamTrack);
            console.log('MediaStreamTrack enabled:', publication.videoTrack?.mediaStreamTrack?.enabled);
            console.log('MediaStreamTrack readyState:', publication.videoTrack?.mediaStreamTrack?.readyState);

            this.localScreenTrack.set(publication.videoTrack);
            this.localTrack.set(publication.videoTrack);
            this.screenShareEnabled.set(true);
        }
    }
});

room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
    console.log('LocalTrackUnpublished:', publication.kind, publication.source);

    if (publication.kind === 'video') {
        if (publication.source === 'camera') {
            this.localCameraTrack.set(undefined);
            if (!this.screenShareEnabled()) {
                this.localTrack.set(undefined);
            }
        } else if (publication.source === 'screen_share') {
            console.log('Screen share track unpublished');
            this.localScreenTrack.set(undefined);
            this.screenShareEnabled.set(false);
            this.localTrack.set(this.localCameraTrack());
        }
    }
});

        try {
            // Get the room name and participant name from the form
            const roomName = this.roomForm.value.roomName!;
            const participantName = this.roomForm.value.participantName!;

            // Get a token from your application server with the room name and participant name
            const token = await this.getToken(roomName, participantName);

            // Connect to the room with the LiveKit URL and the token
            await room.connect(LIVEKIT_URL, token);

            // Publish your camera and microphone
            await room.localParticipant.enableCameraAndMicrophone();
            // this.localTrack.set(room.localParticipant.videoTrackPublications.values().next().value.videoTrack);
            // add this.id to url params
            // window.history.pushState({}, '', `/${roomName}`);
            this.currentRoomLink.set(window.location.origin + '/?id=' + roomName);
            const cameraTrack = Array.from(room.localParticipant.videoTrackPublications.values())
                .find(pub => pub.source === 'camera')?.videoTrack;
            if (cameraTrack) {
                this.localCameraTrack.set(cameraTrack);
                this.localTrack.set(cameraTrack);
            }
        } catch (error: any) {
            console.log(
                'There was an error connecting to the room:',
                error?.error?.errorMessage || error?.message || error
            );
            await this.leaveRoom();
        }
    }

    async leaveRoom() {
        // Leave the room by calling 'disconnect' method over the Room object
        await this.room()?.disconnect();

        // Reset all variables
        this.room.set(undefined);
        this.localTrack.set(undefined);
        this.remoteTracksMap.set(new Map());
    }
    async setCameraEnabled(value: boolean) {
    const room = this.room();
    if (room) {
        const p = room.localParticipant;
        await p.setCameraEnabled(value);
        this.cameraIsEnable.set(value);

        // If we're not screen sharing, update the local track
        if (!this.screenShareEnabled()) {
            if (value) {
                const cameraTrack = Array.from(p.videoTrackPublications.values())
                    .find(pub => pub.source === 'camera')?.videoTrack;
                if (cameraTrack) {
                    this.localTrack.set(cameraTrack);
                }
            } else {
                this.localTrack.set(undefined);
            }
        }
    }
}
 getLocalVideoLabel(): string {
    if (this.screenShareEnabled()) {
        return 'Your Screen';
    }
    return this.roomForm.value.participantName + ' (You)';
}

async copyLink() {
    try {
        await navigator.clipboard.writeText(this.currentRoomLink());
        // You could add a toast notification here
        console.log('Link copied to clipboard');
    } catch (err) {
        console.error('Failed to copy link:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = this.currentRoomLink();
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}

// Update your setScreenShareEnabled method to be simpler
async setScreenShareEnabled(value: boolean) {
    const room = this.room();
    if (room) {
        try {
            const p = room.localParticipant;
            console.log('Screen share request:', value);

            if (value) {
                // Start screen sharing
                await p.setScreenShareEnabled(true);

                // Debug: Check if screen share track was created
                setTimeout(() => {
                    const screenTrack = Array.from(p.videoTrackPublications.values())
                        .find(pub => pub.source === 'screen_share');

                    console.log('Screen track found:', screenTrack);
                    console.log('Screen track enabled:', screenTrack?.isEnabled);
                    console.log('Screen track muted:', screenTrack?.isMuted);
                    console.log('All video tracks:', Array.from(p.videoTrackPublications.values()));

                    if (screenTrack?.videoTrack) {
                        console.log('Screen track mediaStreamTrack:', screenTrack.videoTrack.mediaStreamTrack);
                        console.log('MediaStreamTrack readyState:', screenTrack.videoTrack.mediaStreamTrack?.readyState);
                    }
                }, 1000);

            } else {
                await p.setScreenShareEnabled(false);
            }
        } catch (error) {
            console.error('Error toggling screen share:', error);
            this.screenShareEnabled.set(false);
        }
    }
}
    async setMicrophoneEnabled(value: boolean) {

        const room = this.room();
        if (room) {
            const p = room.localParticipant;
            await p.setMicrophoneEnabled(value);
            this.microphoneEnabled.set(value);
        }
    }

    @HostListener('window:beforeunload')
    async ngOnDestroy() {
        // On window closed or component destroyed, leave the room
        await this.leaveRoom();
    }

    /**
     * --------------------------------------------
     * GETTING A TOKEN FROM YOUR APPLICATION SERVER
     * --------------------------------------------
     * The method below request the creation of a token to
     * your application server. This prevents the need to expose
     * your LiveKit API key and secret to the client side.
     *
     * In this sample code, there is no user control at all. Anybody could
     * access your application server endpoints. In a real production
     * environment, your application server must identify the user to allow
     * access to the endpoints.
     */
    async getToken(roomName: string, participantName: string): Promise<string> {
        const response = await lastValueFrom(
            this.httpClient.post<{ token: string }>(APPLICATION_SERVER_URL + 'token', { roomName, participantName })
        );
        return response.token;
    }
    // Method to change video size
    setVideoSize(size: 'small' | 'medium' | 'large' | 'fullscreen') {
        this.videoSize.set(size);

        if (size === 'fullscreen') {
            this.enterFullscreen();
        } else if (this.isFullscreen()) {
            this.exitFullscreen();
        }
    }

    // Enter fullscreen mode
    async enterFullscreen() {
        try {
            const videoElement = document.querySelector('video') as HTMLVideoElement;
            if (videoElement && videoElement.requestFullscreen) {
                await videoElement.requestFullscreen();
                this.isFullscreen.set(true);
            }
        } catch (error) {
            console.error('Error entering fullscreen:', error);
            // Fallback to CSS fullscreen
            this.isFullscreen.set(true);
        }
    }

    // Exit fullscreen mode
    async exitFullscreen() {
        try {
            if (document.exitFullscreen && document.fullscreenElement) {
                await document.exitFullscreen();
            }
            this.isFullscreen.set(false);
            this.videoSize.set('medium');
        } catch (error) {
            console.error('Error exiting fullscreen:', error);
            this.isFullscreen.set(false);
        }
    }

    // Toggle fullscreen
    toggleFullscreen() {
        if (this.isFullscreen()) {
            this.exitFullscreen();
        } else {
            this.setVideoSize('fullscreen');
        }
    }

    // Listen for fullscreen changes
    @HostListener('document:fullscreenchange', ['$event'])
    onFullscreenChange() {
        if (!document.fullscreenElement && this.isFullscreen()) {
            this.isFullscreen.set(false);
            this.videoSize.set('medium');
        }
    }

    // Get CSS class for current video size
    getVideoSizeClass(): string {
        const size = this.videoSize();
        return `video-${size}`;
    }
    setMainVideo(track: VideoTrack, participantIdentity: string, isLocal: boolean = false) {
    this.mainVideoTrack.set(track);
    this.mainVideoParticipant.set(participantIdentity);
    this.isLocalMainVideo.set(isLocal);
  }

  // Method to get the current main video track
  getCurrentMainVideoTrack(): VideoTrack | null {
    // Priority: manually selected > screen share > local camera > first remote video
    if (this.mainVideoTrack()) {
      return this.mainVideoTrack();
    }

    // Auto-selection logic: prefer screen share when available
    if (this.screenShareEnabled() && this.localTrack()) {
      return this.localTrack() as VideoTrack;
    }

    if (this.localCameraTrack()) {
      return this.localCameraTrack() as VideoTrack;
    }

    // Get first available remote video track
    const firstRemoteVideo = Array.from(this.remoteTracksMap().values())
      .find(track => track.trackPublication.kind === 'video');

    return firstRemoteVideo?.trackPublication.videoTrack || null;
  }

  // Method to get main video label
  getCurrentMainVideoLabel(): string {
    if (this.mainVideoParticipant()) {
      return this.mainVideoParticipant();
    }

    // Auto-selection labels
    if (this.screenShareEnabled() && this.localTrack()) {
      return 'You (Screen Share)';
    }

    if (this.localCameraTrack()) {
      return 'You (Camera)';
    }

    const firstRemoteVideo = Array.from(this.remoteTracksMap().values())
      .find(track => track.trackPublication.kind === 'video');

    return firstRemoteVideo?.participantIdentity || 'No Video';
  }

  // Check if we should show camera PiP overlay
  shouldShowCameraPiP(): boolean {
    return this.screenShareEnabled() &&
           !!this.localCameraTrack() &&
           this.getCurrentMainVideoTrack() !== this.localCameraTrack();
  }

  // Method to check if current main video is local
  isCurrentMainVideoLocal(): boolean {
    if (this.mainVideoTrack()) {
      return this.isLocalMainVideo();
    }

    return this.screenShareEnabled() || !!this.localCameraTrack();
  }

  // Method to reset main video selection (go back to auto-selection)
  resetMainVideoSelection() {
    this.mainVideoTrack.set(null);
    this.mainVideoParticipant.set('');
    this.isLocalMainVideo.set(true);
  }

  // Method to toggle fullscreen for main video
  toggleMainVideoFullscreen() {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }
}
